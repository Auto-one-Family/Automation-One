#pragma once

#include "services/actuator/actuator_drivers/iactuator_driver.h"

#include <Arduino.h>
#include <cstdio>
#include <vector>

class VirtualActuatorDriver : public IActuatorDriver {
public:
    VirtualActuatorDriver()
        : initialized_(false),
          emergency_stopped_(false),
          current_value_(0.0f),
          current_state_(false),
          last_loop_time_(0) {}

    // Lifecycle --------------------------------------------------------------
    bool begin(const ActuatorConfig& config) override {
        config_ = config;
        initialized_ = true;
        emergency_stopped_ = false;
        current_value_ = 0.0f;
        current_state_ = false;
        command_log_.clear();
        command_log_.push_back("INIT:GPIO_" + String(config.gpio));
        return true;
    }

    void end() override {
        command_log_.push_back("END");
        initialized_ = false;
    }

    bool isInitialized() const override { return initialized_; }

    // Control ----------------------------------------------------------------
    bool setValue(float normalized_value) override {
        if (!initialized_ || emergency_stopped_) return false;
        normalized_value = constrain(normalized_value, 0.0f, 1.0f);
        current_value_ = normalized_value;
        char buf[32];
        snprintf(buf, sizeof(buf), "SET_VALUE:%.3f", normalized_value);
        command_log_.push_back(String(buf));
        return true;
    }

    bool setBinary(bool state) override {
        if (!initialized_ || emergency_stopped_) return false;
        current_state_ = state;
        command_log_.push_back(state ? "SET_BINARY:ON" : "SET_BINARY:OFF");
        return true;
    }

    // Safety -----------------------------------------------------------------
    bool emergencyStop(const String& reason) override {
        if (!initialized_) return false;
        emergency_stopped_ = true;
        current_state_ = false;
        current_value_ = 0.0f;
        command_log_.push_back("EMERGENCY_STOP:" + reason);
        return true;
    }

    bool clearEmergency() override {
        if (!initialized_) return false;
        emergency_stopped_ = false;
        command_log_.push_back("CLEAR_EMERGENCY");
        return true;
    }

    void loop() override {
        last_loop_time_ = millis();
    }

    // Status -----------------------------------------------------------------
    ActuatorStatus getStatus() const override {
        ActuatorStatus status;
        status.gpio = config_.gpio;
        status.actuator_type = config_.actuator_type;
        status.current_state = current_state_;
        status.current_pwm = static_cast<uint8_t>(current_value_ * 255);
        status.emergency_state = emergency_stopped_
            ? EmergencyState::EMERGENCY_ACTIVE
            : EmergencyState::EMERGENCY_NORMAL;
        status.runtime_ms = config_.accumulated_runtime_ms;
        return status;
    }

    const ActuatorConfig& getConfig() const override { return config_; }
    String getType() const override { return config_.actuator_type; }

    // Test Helpers -----------------------------------------------------------
    bool wasCommandCalled(const String& prefix) const {
        for (const auto& entry : command_log_) {
            if (entry.startsWith(prefix)) return true;
        }
        return false;
    }

    int getCommandCount(const String& prefix) const {
        int count = 0;
        for (const auto& entry : command_log_) {
            if (entry.startsWith(prefix)) count++;
        }
        return count;
    }

    const std::vector<String>& getCommandLog() const { return command_log_; }
    void clearCommandLog() { command_log_.clear(); }

private:
    ActuatorConfig config_;
    bool initialized_;
    bool emergency_stopped_;
    float current_value_;
    bool current_state_;
    unsigned long last_loop_time_;
    std::vector<String> command_log_;
};

