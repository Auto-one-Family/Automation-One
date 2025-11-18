#include "safety_controller.h"

#include "../../utils/logger.h"
#include "actuator_manager.h"

SafetyController& safetyController = SafetyController::getInstance();

SafetyController::SafetyController()
    : emergency_state_(EmergencyState::EMERGENCY_NORMAL),
      emergency_reason_(""),
      emergency_timestamp_(0),
      recovery_config_(),
      initialized_(false) {}

SafetyController& SafetyController::getInstance() {
    static SafetyController instance;
    return instance;
}

bool SafetyController::begin() {
    if (initialized_) {
        return true;
    }
    emergency_state_ = EmergencyState::EMERGENCY_NORMAL;
    emergency_reason_.clear();
    emergency_timestamp_ = 0;
    initialized_ = true;
    LOG_INFO("SafetyController initialized");
    return true;
}

void SafetyController::end() {
    initialized_ = false;
    LOG_INFO("SafetyController shutdown");
}

bool SafetyController::emergencyStopAll(const String& reason) {
    if (!initialized_ && !begin()) {
        return false;
    }

    emergency_state_ = EmergencyState::EMERGENCY_ACTIVE;
    emergency_reason_ = reason;
    emergency_timestamp_ = millis();
    logEmergencyEvent(reason, 255);

    return actuatorManager.emergencyStopAll();
}

bool SafetyController::emergencyStopActuator(uint8_t gpio, const String& reason) {
    if (!initialized_ && !begin()) {
        return false;
    }

    emergency_state_ = EmergencyState::EMERGENCY_ACTIVE;
    emergency_reason_ = reason;
    emergency_timestamp_ = millis();
    logEmergencyEvent(reason, gpio);

    return actuatorManager.emergencyStopActuator(gpio);
}

bool SafetyController::clearEmergencyStop() {
    emergency_state_ = EmergencyState::EMERGENCY_CLEARING;
    if (!verifySystemSafety()) {
    actuatorManager.publishActuatorAlert(255, "verification_failed", "clear_emergency");
        LOG_WARNING("SafetyController verification failed during clearEmergencyStop");
        return false;
    }

    bool success = actuatorManager.clearEmergencyStop();
    if (success) {
        emergency_state_ = EmergencyState::EMERGENCY_RESUMING;
    }
    return success;
}

bool SafetyController::clearEmergencyStopActuator(uint8_t gpio) {
    if (!verifyActuatorSafety(gpio)) {
        return false;
    }
    return actuatorManager.clearEmergencyStopActuator(gpio);
}

bool SafetyController::resumeOperation() {
    if (emergency_state_ != EmergencyState::EMERGENCY_RESUMING &&
        emergency_state_ != EmergencyState::EMERGENCY_ACTIVE) {
        return true;
    }

    delay(recovery_config_.inter_actuator_delay_ms);
    emergency_state_ = EmergencyState::EMERGENCY_NORMAL;
    emergency_reason_.clear();
    return true;
}

bool SafetyController::isEmergencyActive() const {
    return emergency_state_ != EmergencyState::EMERGENCY_NORMAL;
}

bool SafetyController::isEmergencyActive(uint8_t gpio) const {
    return actuatorManager.getEmergencyStopStatus(gpio);
}

void SafetyController::setRecoveryConfig(const RecoveryConfig& config) {
    recovery_config_ = config;
}

String SafetyController::getRecoveryProgress() const {
    switch (emergency_state_) {
        case EmergencyState::EMERGENCY_ACTIVE:
            return "active";
        case EmergencyState::EMERGENCY_CLEARING:
            return "clearing";
        case EmergencyState::EMERGENCY_RESUMING:
            return "resuming";
        default:
            return "normal";
    }
}

bool SafetyController::verifySystemSafety() const {
    if (recovery_config_.max_retry_attempts == 0) {
        return false;
    }
    if (recovery_config_.verification_timeout_ms == 0 || emergency_timestamp_ == 0) {
        return true;
    }
    unsigned long elapsed = millis() - emergency_timestamp_;
    return elapsed >= recovery_config_.verification_timeout_ms;
}

bool SafetyController::verifyActuatorSafety(uint8_t gpio) const {
    if (gpio == 255) {
        return false;
    }
    if (!actuatorManager.hasActuatorOnGPIO(gpio)) {
        return false;
    }
    return !actuatorManager.getEmergencyStopStatus(gpio);
}

void SafetyController::logEmergencyEvent(const String& reason, uint8_t gpio) {
    String message = "SafetyController emergency: " + reason;
    if (gpio != 255) {
        message += " gpio=" + String(gpio);
    }
    LOG_WARNING(message);
}

