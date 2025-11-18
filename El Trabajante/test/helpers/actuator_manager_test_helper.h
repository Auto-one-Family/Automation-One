#pragma once

#include <memory>

#include "services/actuator/actuator_manager.h"
#include "services/sensor/sensor_manager.h"

class ActuatorManagerTestHelper {
public:
    static bool configureWithDriver(const ActuatorConfig& config,
                                    std::unique_ptr<IActuatorDriver> driver) {
        if (!driver) {
            return false;
        }

        ActuatorManager& manager = actuatorManager;
        if (!manager.initialized_ && !manager.begin()) {
            return false;
        }

        ActuatorConfig cfg = config;
        if (!manager.validateActuatorConfig(cfg)) {
            return false;
        }

        if (sensorManager.hasSensorOnGPIO(cfg.gpio)) {
            return false;
        }

        if (manager.hasActuatorOnGPIO(cfg.gpio)) {
            manager.removeActuator(cfg.gpio);
        }

        auto slot = manager.getFreeSlot();
        if (!slot) {
            return false;
        }

        slot->driver = std::move(driver);
        slot->config = slot->driver->getConfig();
        slot->gpio = cfg.gpio;
        slot->in_use = true;
        slot->emergency_stopped = false;
        manager.actuator_count_++;
        manager.publishActuatorStatus(cfg.gpio);
        return true;
    }
};

