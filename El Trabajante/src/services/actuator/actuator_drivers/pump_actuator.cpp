#include "pump_actuator.h"

#include <cstring>

#include "../../../drivers/gpio_manager.h"
#include "../../../error_handling/error_tracker.h"
#include "../../../models/error_codes.h"
#include "../../../utils/logger.h"

PumpActuator::PumpActuator()
    : gpio_(255),
      initialized_(false),
      running_(false),
      emergency_stopped_(false),
      activation_start_ms_(0),
      last_stop_ms_(0),
      accumulated_runtime_ms_(0),
      gpio_manager_(&GPIOManager::getInstance()) {
  memset(activation_timestamps_, 0, sizeof(activation_timestamps_));
}

PumpActuator::~PumpActuator() {
  end();
}

bool PumpActuator::begin(const ActuatorConfig& config) {
  if (initialized_) {
    return true;
  }

  if (config.gpio == 255) {
    LOG_ERROR("PumpActuator: invalid GPIO");
    errorTracker.trackError(ERROR_ACTUATOR_INIT_FAILED,
                            ERROR_SEVERITY_ERROR,
                            "PumpActuator invalid GPIO");
    return false;
  }

  config_ = config;
  gpio_ = config.gpio;

  if (!gpio_manager_->requestPin(gpio_, "actuator", config_.actuator_name.c_str())) {
    LOG_ERROR("PumpActuator: failed to reserve GPIO " + String(gpio_));
    errorTracker.trackError(ERROR_GPIO_RESERVED,
                            ERROR_SEVERITY_ERROR,
                            ("Pump GPIO busy: " + String(gpio_)).c_str());
    return false;
  }

  if (!gpio_manager_->configurePinMode(gpio_, OUTPUT)) {
    LOG_ERROR("PumpActuator: pinMode failed for GPIO " + String(gpio_));
    errorTracker.trackError(ERROR_GPIO_INVALID_MODE,
                            ERROR_SEVERITY_ERROR,
                            ("pump pinMode failed: " + String(gpio_)).c_str());
    gpio_manager_->releasePin(gpio_);
    return false;
  }

  digitalWrite(gpio_, config_.default_state ? HIGH : LOW);
  running_ = config_.default_state;
  config_.current_state = running_;
  config_.current_pwm = running_ ? 255 : 0;
  config_.last_command_ts = millis();

  accumulated_runtime_ms_ = config_.accumulated_runtime_ms;
  last_stop_ms_ = millis();

  initialized_ = true;
  emergency_stopped_ = false;

  LOG_INFO("PumpActuator initialized on GPIO " + String(gpio_));
  return true;
}

void PumpActuator::end() {
  if (!initialized_) {
    return;
  }

  applyState(false, true);
  gpio_manager_->releasePin(gpio_);
  gpio_ = 255;
  initialized_ = false;
  running_ = false;
  emergency_stopped_ = false;
}

bool PumpActuator::setValue(float normalized_value) {
  bool desired_state = normalized_value >= 0.5f;
  return setBinary(desired_state);
}

bool PumpActuator::setBinary(bool state) {
  return applyState(state, false);
}

// Safety-Feature (Emergency-Stop-Enforcement):
// ESP ignoriert Commands während Emergency (Safety-Critical per IEC 61508, ISO 13849).
// WICHTIG: ESP triggert NICHT selbst Emergency (nur bei Server-Command).
// Dokumentiert in: docs/ZZZ.md - "Server-Centric Pragmatic Deviations"
bool PumpActuator::applyState(bool state, bool force) {
  if (!initialized_) {
    LOG_ERROR("PumpActuator::applyState called before init");
    return false;
  }

  if (!force && emergency_stopped_) {
    LOG_WARNING("PumpActuator: command ignored, emergency active");
    return false;
  }

  if (state && !force && !canActivate()) {
    LOG_WARNING("PumpActuator: runtime protection prevented activation on GPIO " + String(gpio_));
    errorTracker.trackError(ERROR_ACTUATOR_SET_FAILED,
                            ERROR_SEVERITY_WARNING,
                            "Pump runtime protection triggered");
    return false;
  }

  if (state == running_) {
    return true;
  }

  int level = state ? HIGH : LOW;
  if (config_.inverted_logic) {
    level = (level == HIGH) ? LOW : HIGH;
  }

  digitalWrite(gpio_, level);

  unsigned long now = millis();
  if (state) {
    activation_start_ms_ = now;
    recordActivation(now);
  } else if (activation_start_ms_ != 0) {
    accumulated_runtime_ms_ += now - activation_start_ms_;
    config_.accumulated_runtime_ms = accumulated_runtime_ms_;
    activation_start_ms_ = 0;
    last_stop_ms_ = now;
  }

  running_ = state;
  config_.current_state = state;
  config_.current_pwm = state ? 255 : 0;
  config_.last_command_ts = now;

  LOG_INFO("PumpActuator GPIO " + String(gpio_) + (state ? " ON" : " OFF"));
  return true;
}

void PumpActuator::recordActivation(unsigned long now) {
  for (uint8_t i = ACTIVATION_HISTORY - 1; i > 0; i--) {
    activation_timestamps_[i] = activation_timestamps_[i - 1];
  }
  activation_timestamps_[0] = now;
}

// Hardware-Safety-Feature (Runtime-Protection):
// Schützt Pump vor Überhitzung/Verschleiß (wie Thermal-Shutdown in CPUs).
// Protection-Parameter werden vom Server konfiguriert (max_runtime, cooldown, max_activations).
// WICHTIG: Dies ist NICHT Business-Logic (keine Priority-basierte Entscheidung).
// Dokumentiert in: docs/ZZZ.md - "Server-Centric Pragmatic Deviations"
bool PumpActuator::canActivate() const {
  if (!initialized_) {
    return false;
  }

  unsigned long now = millis();

  if (accumulated_runtime_ms_ >= protection_.max_runtime_ms && last_stop_ms_ != 0) {
    unsigned long since_stop = now - last_stop_ms_;
    if (since_stop < protection_.cooldown_ms) {
      return false;
    }
  }

  unsigned long window_start = now - protection_.activation_window_ms;
  uint16_t activations_in_window = 0;
  for (uint8_t i = 0; i < ACTIVATION_HISTORY; i++) {
    if (activation_timestamps_[i] >= window_start && activation_timestamps_[i] != 0) {
      activations_in_window++;
    }
  }

  if (activations_in_window >= protection_.max_activations_per_hour) {
    return false;
  }

  return true;
}

bool PumpActuator::emergencyStop(const String& reason) {
  LOG_WARNING("PumpActuator emergency stop (" + reason + ") on GPIO " + String(gpio_));
  emergency_stopped_ = true;
  return applyState(false, true);
}

bool PumpActuator::clearEmergency() {
  emergency_stopped_ = false;
  return true;
}

void PumpActuator::loop() {
  if (running_ && activation_start_ms_ != 0) {
    unsigned long now = millis();
    config_.current_pwm = 255;
    config_.current_state = true;
    config_.accumulated_runtime_ms = accumulated_runtime_ms_ + (now - activation_start_ms_);
  }
}

ActuatorStatus PumpActuator::getStatus() const {
  ActuatorStatus status;
  status.gpio = gpio_;
  status.actuator_type = ActuatorTypeTokens::PUMP;
  status.current_state = running_;
  status.current_pwm = running_ ? 255 : 0;
  status.runtime_ms = running_ && activation_start_ms_ != 0
                          ? accumulated_runtime_ms_ + (millis() - activation_start_ms_)
                          : accumulated_runtime_ms_;
  status.error_state = false;
  status.error_message = "";
  status.emergency_state = emergency_stopped_ ? EmergencyState::EMERGENCY_ACTIVE
                                              : EmergencyState::EMERGENCY_NORMAL;
  return status;
}

void PumpActuator::setRuntimeProtection(const RuntimeProtection& protection) {
  protection_ = protection;
}

