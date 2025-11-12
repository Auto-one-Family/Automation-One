#ifndef ACTUATOR_SYSTEM_H
#define ACTUATOR_SYSTEM_H

#include <Arduino.h>
#include "actuator_types.h"

// Forward declarations
class PiSensorClient;

// =============================================================================
// ACTUATOR BASE CLASS
// =============================================================================

class HardwareActuatorBase {
public:
    virtual ~HardwareActuatorBase() = default;
    virtual bool init(uint8_t gpio) = 0;
    virtual bool setValue(float value) = 0;      // 0.0-1.0 für PWM/Analog
    virtual bool setBinary(bool state) = 0;     // ON/OFF für Digital  
    virtual bool emergency_stop() = 0;          // Sicherheits-Stop
    virtual String getType() = 0;               // "pump", "valve", "pwm"
    virtual String getStatus() = 0;             // Aktueller Status
    virtual void sleep() {}                     // Power-Management
    virtual void wake() {}
};

// =============================================================================
// ENHANCED ACTUATOR STRUCT
// =============================================================================

struct EnhancedActuator {
    uint8_t gpio;
    String library_name;
    String actuator_name;
    String subzone_id;
    HardwareActuatorBase* instance;
    bool active;
    unsigned long last_command;
    float last_value;
    bool hardware_configured;
};

// =============================================================================
// FORWARD DECLARATIONS
// =============================================================================

class PiEnhancedActuator;

// =============================================================================
// ADVANCED ACTUATOR SYSTEM CLASS
// =============================================================================

#ifndef MAX_ACTUATORS
#define MAX_ACTUATORS 6  // Xiao ESP32-C3 optimiert
#endif

class AdvancedActuatorSystem {
public:
    AdvancedActuatorSystem();
    
    ~AdvancedActuatorSystem();

bool initialize(PiSensorClient* pi_client, const String& esp_id, const String& zone_id);
    
    bool configureActuator(uint8_t gpio, const String& library_name, const String& actuator_name, const String& subzone_id);
    
    bool controlActuator(uint8_t gpio, float value);
    
    bool controlActuatorBinary(uint8_t gpio, bool state);
    
    bool removeActuator(uint8_t gpio);
    
    bool emergencyStopAll();
    
    bool emergencyStopActuator(uint8_t gpio);
    
    uint8_t getActiveActuatorCount() const;
    
    String getActuatorInfo(uint8_t gpio) const;
    
    bool isActuatorConfigured(uint8_t gpio) const;
    
    void printActuatorStatus() const;
    
    void performActuatorControl();

private:
    PiSensorClient* pi_client_ptr = nullptr;
    String esp_id;
    String zone_id;
    EnhancedActuator* actuators_ptr = nullptr;
    uint8_t active_actuator_count = 0;
    bool system_initialized = false;
};

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

HardwareActuatorBase* createActuatorInstance(const String& type);
PiEnhancedActuator* createPiEnhancedActuator(uint8_t gpio, const String& type, PiSensorClient* pi_client);

#endif // ACTUATOR_SYSTEM_H 