#include "test/helpers/actuator_test_helpers.h"

#include <unity.h>

#include <algorithm>
#include <cstring>

#include "services/actuator/actuator_manager.h"

#include "drivers/gpio_manager.h"
#include "drivers/pwm_controller.h"
#include "mock_mqtt_broker.h"
#include "services/actuator/safety_controller.h"
#include "services/config/config_manager.h"
#include "services/config/storage_manager.h"
#include "services/sensor/sensor_manager.h"
#include "utils/logger.h"
#include "utils/topic_builder.h"

namespace {

bool actuator_stack_initialized = false;

#ifdef XIAO_ESP32C3
static const uint8_t kOutputCandidates[] = {2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 21};
#else
static const uint8_t kOutputCandidates[] = {12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27};
#endif

bool canUsePwmGPIO(uint8_t gpio) {
    if (!pwmController.isInitialized()) {
        pwmController.begin();
    }
    return pwmController.getChannelForGPIO(gpio) == 255;
}

}  // namespace

std::vector<uint8_t> getAvailableActuatorGPIOs() {
    std::vector<uint8_t> gpios;
    for (uint8_t gpio : kOutputCandidates) {
        if (!gpioManager.isPinAvailable(gpio)) {
            continue;
        }
        if (sensorManager.hasSensorOnGPIO(gpio)) {
            continue;
        }
        if (actuatorManager.hasActuatorOnGPIO(gpio)) {
            continue;
        }
        if (safetyController.isEmergencyActive(gpio)) {
            continue;
        }
        gpios.push_back(gpio);
    }
    return gpios;
}

uint8_t findFreeTestGPIO(const char* type) {
    auto gpios = getAvailableActuatorGPIOs();
    if (gpios.empty()) {
        return 255;
    }

    if (type && strcmp(type, "pwm") == 0) {
        for (auto gpio : gpios) {
            if (canUsePwmGPIO(gpio)) {
                return gpio;
            }
        }
        return 255;
    }

    return gpios.front();
}

std::pair<uint8_t, uint8_t> getAvailableValveGPIOPair() {
    auto gpios = getAvailableActuatorGPIOs();
    if (gpios.size() < 2) {
        return {255, 255};
    }
    return {gpios[0], gpios[1]};
}

uint8_t findExistingActuator(const String& type) {
    for (uint8_t gpio : kOutputCandidates) {
        if (!actuatorManager.hasActuatorOnGPIO(gpio)) {
            continue;
        }
        ActuatorConfig cfg = actuatorManager.getActuatorConfig(gpio);
        if (cfg.gpio == 255) {
            continue;
        }
        if (type.length() == 0 || cfg.actuator_type == type) {
            return gpio;
        }
    }
    return 255;
}

void ensure_actuator_stack_initialized() {
    if (actuator_stack_initialized) {
        return;
    }

    Serial.begin(115200);
    delay(200);

    logger.begin();
    logger.setLogLevel(LOG_INFO);
    gpioManager.initializeAllPinsToSafeMode();
#ifdef XIAO_ESP32C3
    gpioManager.releaseI2CPins();
#endif
    TEST_ASSERT_TRUE_MESSAGE(storageManager.begin(), "StorageManager begin failed");
    TEST_ASSERT_TRUE_MESSAGE(configManager.begin(), "ConfigManager begin failed");
    TEST_ASSERT_TRUE_MESSAGE(configManager.loadAllConfigs(), "ConfigManager loadAllConfigs failed");

    String esp_id = configManager.getESPId();
    if (esp_id.isEmpty()) {
        esp_id = "ESP_TEST_NODE";
    }
    TopicBuilder::setEspId(esp_id.c_str());

    String kaiser_id = configManager.getKaiserId();
    if (kaiser_id.isEmpty()) {
        kaiser_id = "god";
    }
    TopicBuilder::setKaiserId(kaiser_id.c_str());

    TEST_ASSERT_TRUE_MESSAGE(sensorManager.begin(), "SensorManager failed to initialize");
    TEST_ASSERT_TRUE_MESSAGE(pwmController.begin(), "PWMController failed to initialize");
    TEST_ASSERT_TRUE_MESSAGE(actuatorManager.begin(), "ActuatorManager failed to initialize");
#ifdef SAFETY_CONTROLLER_AVAILABLE
    TEST_ASSERT_TRUE_MESSAGE(safetyController.begin(), "SafetyController failed to initialize");
#endif

    actuator_stack_initialized = true;
}

void actuator_test_teardown(MockMQTTBroker* broker) {
    if (broker) {
        broker->clearPublished();
    }

    if (safetyController.isEmergencyActive()) {
        safetyController.clearEmergencyStop();
    }
}

