#pragma once

#include <Arduino.h>
#include <memory>

#include "services/actuator/actuator_manager.h"
#include "actuator_manager_test_helper.h"
#include "virtual_actuator_driver.h"

class TemporaryTestActuator {
public:
    enum class TestMode { VIRTUAL, REAL_HARDWARE };

    TemporaryTestActuator(uint8_t gpio,
                          const String& type,
                          TestMode mode = TestMode::VIRTUAL,
                          uint8_t aux_gpio = 255)
        : gpio_(gpio),
          mode_(mode),
          created_(false),
          virtual_driver_ptr_(nullptr) {
        ActuatorConfig cfg;
        cfg.gpio = gpio;
        cfg.aux_gpio = aux_gpio;
        cfg.actuator_type = type;
        cfg.actuator_name = "Test_" + type;
        cfg.subzone_id = "test_zone";
        cfg.active = true;
        cfg.default_state = false;

        if (!actuatorManager.isInitialized()) {
            actuatorManager.begin();
        }

        if (mode_ == TestMode::VIRTUAL) {
            auto driver = std::make_unique<VirtualActuatorDriver>();
            if (!driver->begin(cfg)) {
                return;
            }
            virtual_driver_ptr_ = driver.get();
            created_ = ActuatorManagerTestHelper::configureWithDriver(cfg, std::move(driver));
        } else {
            created_ = actuatorManager.configureActuator(cfg);
        }
    }

    ~TemporaryTestActuator() {
        if (created_) {
            actuatorManager.removeActuator(gpio_);
        }
    }

    bool isValid() const { return created_; }
    uint8_t getGPIO() const { return gpio_; }
    VirtualActuatorDriver* getVirtualDriver() const {
        return (mode_ == TestMode::VIRTUAL) ? virtual_driver_ptr_ : nullptr;
    }

private:
    uint8_t gpio_;
    TestMode mode_;
    bool created_;
    VirtualActuatorDriver* virtual_driver_ptr_;
};

