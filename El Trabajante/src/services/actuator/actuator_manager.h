#ifndef SERVICES_ACTUATOR_ACTUATOR_MANAGER_H
#define SERVICES_ACTUATOR_ACTUATOR_MANAGER_H

#include <Arduino.h>

// ============================================
// Actuator Manager - Phase 5 Foundation
// ============================================
// Phase 3: Preparatory skeleton for PWM control
// Phase 5: Full actuator management implementation
//
// Purpose: Actuator control coordination
// - PWM-based actuator control (pumps, valves, dimmers)
// - Safety constraints and interlocks
// - Integration with Cross-ESP Logic (Phase 6)

// ============================================
// ACTUATOR MANAGER CLASS
// ============================================
// Singleton class managing actuator operations

class ActuatorManager {
public:
    // ============================================
    // SINGLETON PATTERN
    // ============================================
    static ActuatorManager& getInstance() {
        static ActuatorManager instance;
        return instance;
    }

    // Prevent copy and move operations
    ActuatorManager(const ActuatorManager&) = delete;
    ActuatorManager& operator=(const ActuatorManager&) = delete;
    ActuatorManager(ActuatorManager&&) = delete;
    ActuatorManager& operator=(ActuatorManager&&) = delete;

    // ============================================
    // LIFECYCLE MANAGEMENT
    // ============================================
    // Initialize actuator manager
    bool begin();

    // Deinitialize actuator manager
    void end();

    // ============================================
    // PWM ACTUATOR CONTROL (PHASE 3 PREPARATION)
    // ============================================
    // These methods will be fully implemented in Phase 5
    // Currently serve as API skeleton for Phase 3 integration
    
    // Attach a PWM actuator to a GPIO pin
    // Returns assigned PWM channel in channel_out
    bool attachPwmActuator(uint8_t gpio, uint8_t& channel_out);
    
    // Set PWM actuator output (percentage)
    // channel: PWM channel (0-15)
    // percent: Output percentage (0.0 - 100.0)
    bool setPwmPercent(uint8_t channel, float percent);
    
    // Detach a PWM actuator
    bool detachPwmActuator(uint8_t channel);

    // ============================================
    // STATUS QUERIES
    // ============================================
    bool isInitialized() const { return initialized_; }

private:
    // ============================================
    // PRIVATE CONSTRUCTOR (SINGLETON)
    // ============================================
    ActuatorManager() : initialized_(false) {}
    ~ActuatorManager() {}

    // ============================================
    // INTERNAL STATE
    // ============================================
    bool initialized_;
};

// ============================================
// GLOBAL INSTANCE ACCESS
// ============================================
extern ActuatorManager& actuatorManager;

#endif // SERVICES_ACTUATOR_ACTUATOR_MANAGER_H
