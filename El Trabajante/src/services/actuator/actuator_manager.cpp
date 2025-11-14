#include "actuator_manager.h"
#include "../../utils/logger.h"
#include "../../drivers/pwm_controller.h"
#include "../../error_handling/error_tracker.h"
#include "../../models/error_codes.h"

// ============================================
// GLOBAL INSTANCE
// ============================================
ActuatorManager& actuatorManager = ActuatorManager::getInstance();

// ============================================
// LIFECYCLE: INITIALIZATION
// ============================================
bool ActuatorManager::begin() {
    if (initialized_) {
        LOG_WARNING("Actuator Manager already initialized");
        return true;
    }

    LOG_INFO("Actuator Manager initialization started (Phase 3 skeleton)");
    
    // Phase 3: Basic initialization
    // Phase 5: Full actuator driver initialization
    
    initialized_ = true;
    
    LOG_INFO("Actuator Manager initialized (Phase 3 skeleton)");
    LOG_INFO("  Note: Full actuator support in Phase 5");
    
    return true;
}

// ============================================
// LIFECYCLE: DEINITIALIZATION
// ============================================
void ActuatorManager::end() {
    if (!initialized_) {
        LOG_WARNING("Actuator Manager not initialized");
        return;
    }
    
    LOG_INFO("Actuator Manager shutdown");
    
    initialized_ = false;
}

// ============================================
// PWM ACTUATOR ATTACHMENT (PHASE 3 PREPARATION)
// ============================================
bool ActuatorManager::attachPwmActuator(uint8_t gpio, uint8_t& channel_out) {
    if (!initialized_) {
        LOG_ERROR("Actuator Manager not initialized");
        return false;
    }
    
    // Direct pass-through to PWM Controller
    // Phase 5: Add actuator-specific processing and safety checks
    return pwmController.attachChannel(gpio, channel_out);
}

// ============================================
// PWM ACTUATOR CONTROL (PHASE 3 PREPARATION)
// ============================================
bool ActuatorManager::setPwmPercent(uint8_t channel, float percent) {
    if (!initialized_) {
        LOG_ERROR("Actuator Manager not initialized");
        return false;
    }
    
    // Direct pass-through to PWM Controller
    // Phase 5: Add safety constraints and interlocks
    return pwmController.writePercent(channel, percent);
}

// ============================================
// PWM ACTUATOR DETACHMENT (PHASE 3 PREPARATION)
// ============================================
bool ActuatorManager::detachPwmActuator(uint8_t channel) {
    if (!initialized_) {
        LOG_ERROR("Actuator Manager not initialized");
        return false;
    }
    
    // Direct pass-through to PWM Controller
    // Phase 5: Add cleanup and safety checks
    return pwmController.detachChannel(channel);
}
