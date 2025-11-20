#ifndef SERVICES_ACTUATOR_DRIVERS_PUMP_ACTUATOR_H
#define SERVICES_ACTUATOR_DRIVERS_PUMP_ACTUATOR_H

#include "iactuator_driver.h"

class GPIOManager;

class PumpActuator : public IActuatorDriver {
public:
  struct RuntimeProtection {
    unsigned long max_runtime_ms = 3600000UL;      // 1h continuous runtime cap
    uint16_t max_activations_per_hour = 60;        // Duty-cycle protection
    unsigned long cooldown_ms = 30000UL;           // 30s cooldown after cutoff
    unsigned long activation_window_ms = 3600000UL;
  };

  PumpActuator();
  ~PumpActuator() override;

  bool begin(const ActuatorConfig& config) override;
  void end() override;
  bool isInitialized() const override { return initialized_; }

  bool setValue(float normalized_value) override;
  bool setBinary(bool state) override;

  bool emergencyStop(const String& reason) override;
  bool clearEmergency() override;
  void loop() override;

  ActuatorStatus getStatus() const override;
  const ActuatorConfig& getConfig() const override { return config_; }
  String getType() const override { return String(ActuatorTypeTokens::PUMP); }

  void setRuntimeProtection(const RuntimeProtection& protection);
  bool canActivate() const;
  bool isRunning() const { return running_; }

private:
  bool applyState(bool state, bool force);
  void recordActivation(unsigned long now);

  ActuatorConfig config_;
  uint8_t gpio_;
  bool initialized_;
  bool running_;
  bool emergency_stopped_;

  unsigned long activation_start_ms_;
  unsigned long last_stop_ms_;
  unsigned long accumulated_runtime_ms_;

  RuntimeProtection protection_;
  static const uint8_t ACTIVATION_HISTORY = 60;
  unsigned long activation_timestamps_[ACTIVATION_HISTORY];
  GPIOManager* gpio_manager_;
};

#endif  // SERVICES_ACTUATOR_DRIVERS_PUMP_ACTUATOR_H


