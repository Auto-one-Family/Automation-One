#include "actuator_system.h"
#include "pi_sensor_client.h"

// =============================================================================
// HARDWARE ACTUATOR IMPLEMENTATIONS
// =============================================================================

// PUMP ACTUATOR - Relais-basierte Pumpen-Steuerung
class PumpActuator : public HardwareActuatorBase {
private:
    uint8_t relay_pin;
    bool pump_running = false;
    unsigned long start_time = 0;
    unsigned long total_runtime = 0;
    
public:
    bool init(uint8_t gpio) override {
        relay_pin = gpio;
        pinMode(gpio, OUTPUT);
        digitalWrite(gpio, LOW);  // Pumpe AUS (Relais LOW = AUS)
        pump_running = false;
        
        Serial.printf("[PumpActuator] Initialized on GPIO %d\n", gpio);
        return true;
    }
    
    bool setValue(float value) override {
        // value: 0.0 = AUS, > 0.5 = AN
        bool should_run = (value > 0.5);
        
        if (should_run && !pump_running) {
            digitalWrite(relay_pin, HIGH);  // Pumpe AN
            pump_running = true;
            start_time = millis();
            Serial.printf("[PumpActuator] Started on GPIO %d (value: %.2f)\n", relay_pin, value);
            return true;
        } else if (!should_run && pump_running) {
            digitalWrite(relay_pin, LOW);   // Pumpe AUS
            pump_running = false;
            unsigned long session_runtime = millis() - start_time;
            total_runtime += session_runtime;
            Serial.printf("[PumpActuator] Stopped on GPIO %d (ran %lu ms, total: %lu ms)\n", 
                         relay_pin, session_runtime, total_runtime);
            return true;
        }
        
        return true;  // Bereits im gewünschten Zustand
    }
    
    bool setBinary(bool state) override {
        return setValue(state ? 1.0 : 0.0);
    }
    
    bool emergency_stop() override {
        digitalWrite(relay_pin, LOW);
        if (pump_running) {
            pump_running = false;
            Serial.printf("[PumpActuator] EMERGENCY STOP on GPIO %d\n", relay_pin);
        }
        return true;
    }
    
    String getType() override {
        return "pump";
    }
    
    String getStatus() override {
        if (pump_running) {
            unsigned long current_runtime = millis() - start_time;
            return "running_" + String(current_runtime / 1000) + "s";
        }
        return "stopped";
    }
    
    void sleep() override {
        emergency_stop();
    }
};

// PWM ACTUATOR - Variable Geschwindigkeit/Helligkeit
class PWMActuator : public HardwareActuatorBase {
private:
    uint8_t pwm_pin;
    int current_pwm = 0;
    int pwm_channel = 0;  // ESP32 PWM Channel
    
public:
    bool init(uint8_t gpio) override {
        pwm_pin = gpio;
        
        // ESP32 PWM konfigurieren
        pwm_channel = gpio % 16;  // ESP32 hat 16 PWM Kanäle
        ledcSetup(pwm_channel, 1000, 8);  // 1kHz, 8-bit Resolution
        ledcAttachPin(gpio, pwm_channel);
        ledcWrite(pwm_channel, 0);  // Start mit 0
        
        current_pwm = 0;
        Serial.printf("[PWMActuator] Initialized on GPIO %d (channel %d)\n", gpio, pwm_channel);
        return true;
    }
    
    bool setValue(float value) override {
        // value: 0.0-1.0 → 0-255 PWM
        int pwm_value = constrain(value * 255, 0, 255);
        ledcWrite(pwm_channel, pwm_value);
        current_pwm = pwm_value;
        
        Serial.printf("[PWMActuator] GPIO %d set to %d/255 (%.1f%%)\n", 
                     pwm_pin, pwm_value, value * 100);
        return true;
    }
    
    bool setBinary(bool state) override {
        return setValue(state ? 1.0 : 0.0);
    }
    
    bool emergency_stop() override {
        ledcWrite(pwm_channel, 0);
        current_pwm = 0;
        Serial.printf("[PWMActuator] EMERGENCY STOP on GPIO %d\n", pwm_pin);
        return true;
    }
    
    String getType() override {
        return "pwm";
    }
    
    String getStatus() override {
        float percentage = (current_pwm / 255.0) * 100;
        return String(percentage, 1) + "%";
    }
    
    void sleep() override {
        emergency_stop();
    }
};

// VALVE ACTUATOR - Magnetventile/Servo-Ventile
class ValveActuator : public HardwareActuatorBase {
private:
    uint8_t control_pin;
    bool valve_open = false;
    
public:
    bool init(uint8_t gpio) override {
        control_pin = gpio;
        pinMode(gpio, OUTPUT);
        digitalWrite(gpio, LOW);  // Ventil geschlossen
        valve_open = false;
        
        Serial.printf("[ValveActuator] Initialized on GPIO %d\n", gpio);
        return true;
    }
    
    bool setValue(float value) override {
        // value: 0.0 = geschlossen, > 0.5 = offen
        bool should_open = (value > 0.5);
        
        if (should_open != valve_open) {
            digitalWrite(control_pin, should_open ? HIGH : LOW);
            valve_open = should_open;
            Serial.printf("[ValveActuator] GPIO %d %s (value: %.2f)\n", 
                         control_pin, should_open ? "OPENED" : "CLOSED", value);
        }
        
        return true;
    }
    
    bool setBinary(bool state) override {
        return setValue(state ? 1.0 : 0.0);
    }
    
    bool emergency_stop() override {
        digitalWrite(control_pin, LOW);  // Ventil schließen
        valve_open = false;
        Serial.printf("[ValveActuator] EMERGENCY CLOSE on GPIO %d\n", control_pin);
        return true;
    }
    
    String getType() override {
        return "valve";
    }
    
    String getStatus() override {
        return valve_open ? "open" : "closed";
    }
    
    void sleep() override {
        emergency_stop();  // Sicherheit: Ventil schließen
    }
};

// =============================================================================
// PI-ENHANCED ACTUATOR - Hybrid Hardware + Pi Processing
// =============================================================================

class PiEnhancedActuator : public HardwareActuatorBase {
private:
    // Hardware-Konfiguration
    uint8_t gpio;
    String actuator_type;
    
    // Pi-Integration
    PiSensorClient* pi_client;
    bool pi_processing_enabled;
    
    // Fallback-System
    HardwareActuatorBase* fallback_actuator;
    
    // Performance & Caching
    float last_pi_value;
    unsigned long last_pi_command;
    float last_direct_value;
    unsigned long last_hardware_command;
    
    // Kontext-Tracking
    unsigned long session_start = 0;
    float last_temperature = 20.0;
    
    // Statistiken
    uint32_t pi_requests_total;
    uint32_t pi_requests_success;
    uint32_t fallback_uses;
    
public:
    PiEnhancedActuator(uint8_t gpio_pin, const String& type, 
                       PiSensorClient* pi_client_ptr, 
                       HardwareActuatorBase* fallback = nullptr) {
        gpio = gpio_pin;
        actuator_type = type;
        pi_client = pi_client_ptr;
        fallback_actuator = fallback;
        
        // Initialisierung
        pi_processing_enabled = true;
        last_pi_value = 0.0;
        last_pi_command = 0;
        last_direct_value = 0.0;
        last_hardware_command = 0;
        
        // Statistiken
        pi_requests_total = 0;
        pi_requests_success = 0;
        fallback_uses = 0;
        
        Serial.printf("[PiEnhancedActuator] Created hybrid actuator: %s on GPIO %d\n", 
                     type.c_str(), gpio_pin);
    }
    
    bool init(uint8_t gpio_pin) override {
        gpio = gpio_pin;
        
        Serial.printf("[PiEnhancedActuator] Initializing %s on GPIO %d\n", 
                     actuator_type.c_str(), gpio);
        
        // Hardware-GPIO konfigurieren
        if (!initializeHardwareGPIO(gpio)) {
            Serial.printf("[PiEnhancedActuator] ERROR: Failed to initialize GPIO %d\n", gpio);
            return false;
        }
        
        // Fallback-Aktor initialisieren falls vorhanden
        if (fallback_actuator) {
            if (!fallback_actuator->init(gpio)) {
                Serial.printf("[PiEnhancedActuator] WARNING: Fallback actuator initialization failed\n");
            } else {
                Serial.printf("[PiEnhancedActuator] Fallback actuator initialized successfully\n");
            }
        }
        
        Serial.printf("[PiEnhancedActuator] Initialization complete for %s\n", actuator_type.c_str());
        return true;
    }
    
    bool setValue(float requested_value) override {
        last_hardware_command = millis();
        
        Serial.printf("[PiEnhancedActuator] Control request - GPIO %d: %.2f\n", gpio, requested_value);
        
        // SCHRITT 1: Kontext-Daten sammeln
        ActuatorStatus status = buildActuatorStatus(requested_value);
        
        // SCHRITT 2: Pi-Processing versuchen (höchste Priorität)
        if (pi_client && pi_client->isAvailable() && pi_processing_enabled) {
            ProcessedActuatorCommand result;
            
            pi_requests_total++;
            
            if (pi_client->processActuatorData(gpio, actuator_type, status, result)) {
                // Pi-Processing erfolgreich
                pi_requests_success++;
                last_pi_value = result.optimized_value;
                last_pi_command = millis();
                
                Serial.printf("[PiEnhancedActuator] Pi optimized GPIO %d: %.2f → %.2f (%ds, %s)\n", 
                             gpio, requested_value, result.optimized_value, 
                             result.duration, result.reason.c_str());
                
                // Pi-optimierten Befehl ausführen
                bool success = executeHardwareCommand(result.optimized_value);
                
                return success;
            } else {
                Serial.printf("[PiEnhancedActuator] Pi processing failed for GPIO %d, trying fallback\n", gpio);
            }
        } else if (pi_processing_enabled) {
            Serial.printf("[PiEnhancedActuator] Pi not available for GPIO %d, using fallback\n", gpio);
        }
        
        // SCHRITT 3: Fallback-Aktor versuchen (mittlere Priorität)
        if (fallback_actuator) {
            bool success = fallback_actuator->setValue(requested_value);
            if (success) {
                fallback_uses++;
                last_direct_value = requested_value;
                
                Serial.printf("[PiEnhancedActuator] Fallback actuator GPIO %d: %.2f\n", 
                             gpio, requested_value);
                
                return true;
            } else {
                Serial.printf("[PiEnhancedActuator] Fallback actuator also failed for GPIO %d\n", gpio);
            }
        }
        
        // SCHRITT 4: Direkte Hardware-Steuerung als letzte Option
        bool success = executeHardwareCommand(requested_value);
        Serial.printf("[PiEnhancedActuator] Direct control GPIO %d: %.2f\n", 
                     gpio, requested_value);
        
        return success;
    }
    
    bool setBinary(bool state) override {
        return setValue(state ? 1.0 : 0.0);
    }
    
    bool emergency_stop() override {
        Serial.printf("[PiEnhancedActuator] EMERGENCY STOP GPIO %d\n", gpio);
        
        // Alle Steuerungsebenen stoppen
        if (fallback_actuator) {
            fallback_actuator->emergency_stop();
        }
        
        return executeHardwareCommand(0.0);  // Sicher ausschalten
    }
    
    String getType() override {
        return actuator_type + "_pi_enhanced";
    }
    
    String getStatus() override {
        String status = "pi_enhanced_";
        
        if (pi_client && pi_client->isAvailable() && (millis() - last_pi_command) < 30000) {
            status += "pi_active";
        } else if (fallback_actuator) {
            status += "fallback_active";
        } else {
            status += "direct_control";
        }
        
        return status;
    }
    
    void enablePiProcessing(bool enabled) {
        pi_processing_enabled = enabled;
        Serial.printf("[PiEnhancedActuator] Pi processing %s for GPIO %d (%s)\n", 
                     enabled ? "enabled" : "disabled", gpio, actuator_type.c_str());
    }
    
    void printStatistics() {
        Serial.printf("[PiEnhancedActuator] Statistics for GPIO %d (%s):\n", gpio, actuator_type.c_str());
        Serial.printf("  Pi requests: %u total, %u successful (%.1f%% success rate)\n", 
                     pi_requests_total, pi_requests_success, 
                     pi_requests_total > 0 ? (float)pi_requests_success / pi_requests_total * 100 : 0);
        Serial.printf("  Fallback uses: %u\n", fallback_uses);
        Serial.printf("  Last Pi value: %.2f (age: %lu ms)\n", 
                     last_pi_value, millis() - last_pi_command);
        Serial.printf("  Processing mode: %s\n", pi_processing_enabled ? "Pi-enhanced" : "Local only");
    }

private:
    bool initializeHardwareGPIO(uint8_t pin) {
        Serial.printf("[PiEnhancedActuator] Configuring GPIO %d for %s\n", pin, actuator_type.c_str());
        
        if (actuator_type == "pump" || actuator_type == "valve" || actuator_type == "relay") {
            // Digital-Aktoren (Relais)
            pinMode(pin, OUTPUT);
            digitalWrite(pin, LOW);  // Sicher starten (AUS)
            Serial.printf("[PiEnhancedActuator] GPIO %d configured as digital output (relay)\n", pin);
            return true;
        } 
        else if (actuator_type == "pwm" || actuator_type == "fan" || actuator_type == "dimmer") {
            // PWM-Aktoren
            int channel = pin % 16;
            ledcSetup(channel, 1000, 8);  // 1kHz, 8-bit
            ledcAttachPin(pin, channel);
            ledcWrite(channel, 0);  // Start mit 0
            Serial.printf("[PiEnhancedActuator] GPIO %d configured as PWM output (channel %d)\n", pin, channel);
            return true;
        }
        
        // Generic Setup
        pinMode(pin, OUTPUT);
        digitalWrite(pin, LOW);
        Serial.printf("[PiEnhancedActuator] GPIO %d configured as generic output\n", pin);
        return true;
    }
    
    ActuatorStatus buildActuatorStatus(float requested_value) {
        ActuatorStatus status;
        status.gpio = gpio;
        status.actuator_type = actuator_type;
        status.requested_value = requested_value;
        status.current_value = getCurrentHardwareState();
        status.temperature = getContextTemperature();
        status.runtime_minutes = getSessionRuntime();
        status.load_factor = 0.8;  // Placeholder
        status.timestamp = millis();
        
        return status;
    }
    
    float getCurrentHardwareState() {
        // Für Digital-Aktoren
        if (actuator_type == "pump" || actuator_type == "valve") {
            return digitalRead(gpio) ? 1.0 : 0.0;
        }
        
        // Für PWM-Aktoren (vereinfacht)
        return last_direct_value;  // Letzten gesetzten Wert verwenden
    }
    
    float getContextTemperature() {
        // TODO: Integration mit Sensor-System für echte Temperatur
        return 22.0;  // Placeholder
    }
    
    int getSessionRuntime() {
        if (session_start == 0) {
            session_start = millis();
            return 0;
        }
        return (millis() - session_start) / 60000;  // Millisekunden → Minuten
    }
    
    bool executeHardwareCommand(float value) {
        if (actuator_type == "pump" || actuator_type == "valve") {
            // Digital: > 0.5 = AN, <= 0.5 = AUS
            bool state = (value > 0.5);
            digitalWrite(gpio, state ? HIGH : LOW);
            return true;
        } 
        else if (actuator_type == "pwm") {
            // PWM: 0.0-1.0 → 0-255
            int pwm_value = constrain(value * 255, 0, 255);
            int channel = gpio % 16;
            ledcWrite(channel, pwm_value);
            return true;
        }
        
        // Fallback: Digital
        digitalWrite(gpio, value > 0.5 ? HIGH : LOW);
        return true;
    }
};

// =============================================================================
// ADVANCED ACTUATOR SYSTEM IMPLEMENTATION
// =============================================================================

AdvancedActuatorSystem::AdvancedActuatorSystem() {
    active_actuator_count = 0;
    system_initialized = false;
}

AdvancedActuatorSystem::~AdvancedActuatorSystem() {
    if (actuators_ptr) {
        // Cleanup all actuators
        for (int i = 0; i < active_actuator_count; i++) {
            if (actuators_ptr[i].instance) {
                actuators_ptr[i].instance->emergency_stop();
                delete actuators_ptr[i].instance;
            }
        }
        delete[] actuators_ptr;
        actuators_ptr = nullptr;
    }
}

bool AdvancedActuatorSystem::initialize(PiSensorClient* pi_client, const String& esp_identifier, const String& zone_identifier) {
    esp_id = esp_identifier;
    zone_id = zone_identifier;
    pi_client_ptr = pi_client;
    
    // Allocate actuator array
    actuators_ptr = new EnhancedActuator[MAX_ACTUATORS];
    if (!actuators_ptr) {
        Serial.println("[AdvancedActuatorSystem] ERROR: Failed to allocate actuator array");
        return false;
    }
    
    // Initialize array
    for (int i = 0; i < MAX_ACTUATORS; i++) {
        actuators_ptr[i].gpio = 255;
        actuators_ptr[i].instance = nullptr;
        actuators_ptr[i].active = false;
    }
    
    system_initialized = true;
    Serial.println("[AdvancedActuatorSystem] Initialized successfully");
    return true;
}

bool AdvancedActuatorSystem::configureActuator(uint8_t gpio, const String& library_name,
                                              const String& actuator_name, const String& subzone_id) {
    
    if (!system_initialized || !actuators_ptr) {
        Serial.println("[AdvancedActuatorSystem] ERROR: System not properly initialized");
        return false;
    }
    
    if (active_actuator_count >= MAX_ACTUATORS) {
        Serial.println("[AdvancedActuatorSystem] ERROR: Maximum actuators reached");
        return false;
    }
    
    // Create hardware actuator based on library name
    HardwareActuatorBase* hardware_actuator = nullptr;
    HardwareActuatorBase* fallback_actuator = nullptr;
    
    if (library_name == "pump" || library_name == "pump_pi_enhanced") {
        fallback_actuator = new PumpActuator();
    } else if (library_name == "valve" || library_name == "valve_pi_enhanced") {
        fallback_actuator = new ValveActuator();
    } else if (library_name == "pwm" || library_name == "pwm_pi_enhanced") {
        fallback_actuator = new PWMActuator();
    }
    
    // Create Pi-Enhanced actuator if Pi is available
    if (pi_client_ptr && library_name.endsWith("_pi_enhanced")) {
        String actuator_type = library_name;
        actuator_type.replace("_pi_enhanced", "");
        
        hardware_actuator = new PiEnhancedActuator(gpio, actuator_type, pi_client_ptr, fallback_actuator);
    } else {
        // Direct hardware control
        hardware_actuator = fallback_actuator;
        fallback_actuator = nullptr;  // Avoid double reference
    }
    
    if (!hardware_actuator) {
        Serial.printf("[AdvancedActuatorSystem] ERROR: Unknown actuator type: %s\n", library_name.c_str());
        return false;
    }
    
    // Initialize hardware
    if (!hardware_actuator->init(gpio)) {
        Serial.printf("[AdvancedActuatorSystem] ERROR: Actuator initialization failed on GPIO %d\n", gpio);
        delete hardware_actuator;
        if (fallback_actuator) delete fallback_actuator;
        return false;
    }
    
    // Store actuator in array
    EnhancedActuator& actuator = actuators_ptr[active_actuator_count];
    actuator.gpio = gpio;
    actuator.library_name = library_name;
    actuator.actuator_name = actuator_name;
    actuator.subzone_id = subzone_id;
    actuator.instance = hardware_actuator;
    actuator.active = true;
    actuator.last_command = 0;
    actuator.last_value = 0.0;
    actuator.hardware_configured = true;
    
    active_actuator_count++;
    
    Serial.printf("[AdvancedActuatorSystem] Actuator configured: %s on GPIO %d\n", 
                 actuator_name.c_str(), gpio);
    return true;
}

bool AdvancedActuatorSystem::controlActuator(uint8_t gpio, float value) {
    if (!system_initialized || !actuators_ptr) {
        return false;
    }
    
    // Find actuator
    for (int i = 0; i < active_actuator_count; i++) {
        if (actuators_ptr[i].gpio == gpio && actuators_ptr[i].active) {
            bool success = actuators_ptr[i].instance->setValue(value);
            if (success) {
                actuators_ptr[i].last_value = value;
                actuators_ptr[i].last_command = millis();
            }
            return success;
        }
    }
    
    Serial.printf("[AdvancedActuatorSystem] No actuator found on GPIO %d\n", gpio);
    return false;
}

bool AdvancedActuatorSystem::controlActuatorBinary(uint8_t gpio, bool state) {
    return controlActuator(gpio, state ? 1.0 : 0.0);
}

bool AdvancedActuatorSystem::emergencyStopAll() {
    if (!system_initialized || !actuators_ptr) {
        return false;
    }
    
    Serial.println("[AdvancedActuatorSystem] EMERGENCY STOP ALL ACTUATORS");
    
    bool all_success = true;
    for (int i = 0; i < active_actuator_count; i++) {
        if (actuators_ptr[i].active && actuators_ptr[i].instance) {
            if (!actuators_ptr[i].instance->emergency_stop()) {
                all_success = false;
            }
        }
    }
    
    return all_success;
}

bool AdvancedActuatorSystem::emergencyStopActuator(uint8_t gpio) {
    if (!system_initialized || !actuators_ptr) {
        return false;
    }
    
    for (int i = 0; i < active_actuator_count; i++) {
        if (actuators_ptr[i].gpio == gpio && actuators_ptr[i].active) {
            return actuators_ptr[i].instance->emergency_stop();
        }
    }
    
    return false;
}

void AdvancedActuatorSystem::performActuatorControl() {
    // This method is called in main loop()
    // Here periodic actuator tasks can be executed
    static unsigned long last_status_check = 0;
    
    if (millis() - last_status_check > 10000) { // Every 10 seconds
        // Optional: Status checks, timeouts, etc.
        last_status_check = millis();
    }
}

void AdvancedActuatorSystem::printActuatorStatus() const {
    Serial.printf("[AdvancedActuatorSystem] Status: %d active actuators\n", active_actuator_count);
    
    for (int i = 0; i < active_actuator_count; i++) {
        if (actuators_ptr[i].active) {
            Serial.printf("  Actuator %d: %s on GPIO %d (%s) - last value: %.2f\n",
                         i + 1,
                         actuators_ptr[i].actuator_name.c_str(),
                         actuators_ptr[i].gpio,
                         actuators_ptr[i].library_name.c_str(),
                         actuators_ptr[i].last_value);
        }
    }
}

uint8_t AdvancedActuatorSystem::getActiveActuatorCount() const {
    return active_actuator_count;
}

String AdvancedActuatorSystem::getActuatorInfo(uint8_t gpio) const {
    for (int i = 0; i < active_actuator_count; i++) {
        if (actuators_ptr[i].gpio == gpio && actuators_ptr[i].active) {
            return actuators_ptr[i].actuator_name + " (" + actuators_ptr[i].library_name + ")";
        }
    }
    return "No actuator found";
}

bool AdvancedActuatorSystem::isActuatorConfigured(uint8_t gpio) const {
    for (int i = 0; i < active_actuator_count; i++) {
        if (actuators_ptr[i].gpio == gpio && actuators_ptr[i].active) {
            return true;
        }
    }
    return false;
}

bool AdvancedActuatorSystem::removeActuator(uint8_t gpio) {
    for (int i = 0; i < active_actuator_count; i++) {
        if (actuators_ptr[i].gpio == gpio && actuators_ptr[i].active) {
            // Emergency stop and cleanup
            if (actuators_ptr[i].instance) {
                actuators_ptr[i].instance->emergency_stop();
                delete actuators_ptr[i].instance;
                actuators_ptr[i].instance = nullptr;
            }
            
            // Deactivate actuator
            actuators_ptr[i].active = false;
            actuators_ptr[i].gpio = 255;
            actuators_ptr[i].hardware_configured = false;
            
            // Compact array
            for (int j = i; j < active_actuator_count - 1; j++) {
                actuators_ptr[j] = actuators_ptr[j + 1];
            }
            
            active_actuator_count--;
            
            Serial.printf("[AdvancedActuatorSystem] Actuator removed from GPIO %d\n", gpio);
            return true;
        }
    }
    
    return false;
}

// =============================================================================
// FACTORY FUNCTIONS FÜR ACTUATOR CREATION
// =============================================================================

HardwareActuatorBase* createActuatorInstance(const String& type) {
    if (type == "pump") {
        return new PumpActuator();
    } else if (type == "valve") {
        return new ValveActuator();
    } else if (type == "pwm") {
        return new PWMActuator();
    }
    return nullptr;
}

PiEnhancedActuator* createPiEnhancedActuator(uint8_t gpio, const String& type, 
                                            PiSensorClient* pi_client) {
    HardwareActuatorBase* fallback = createActuatorInstance(type);
    return new PiEnhancedActuator(gpio, type, pi_client, fallback);
}