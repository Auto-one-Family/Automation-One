#include "sensor_manager.h"
#include "pi_enhanced_processor.h"
#include "../communication/mqtt_client.h"
#include "../config/config_manager.h"
#include "../../drivers/gpio_manager.h"
#include "../../drivers/i2c_bus.h"
#include "../../drivers/i2c_sensor_protocol.h"
#include "../../drivers/onewire_bus.h"
#include "../../utils/topic_builder.h"
#include "../../utils/logger.h"
#include "../../utils/time_manager.h"
#include "../../utils/onewire_utils.h"  // For OneWire ROM-Code conversion
#include "../../error_handling/error_tracker.h"
#include "../../models/error_codes.h"
#include "../../models/sensor_types.h"
#include "../../models/sensor_registry.h"
#include <map>

// ESP-IDF TAG convention for structured logging
static const char* TAG = "SENSOR";

// ============================================
// DS18B20 SPECIAL VALUE DETECTION (Defense-in-Depth)
// ============================================
// RAW = Temperature × 16 (12-bit resolution)
// -127°C = -2032 RAW: Sensor disconnected, CRC failure, or bus error
// +85°C = +1360 RAW: Power-on reset value (factory default before first conversion)
constexpr int16_t DS18B20_RAW_SENSOR_FAULT = -2032;   // -127°C: Disconnected/CRC fail
constexpr int16_t DS18B20_RAW_POWER_ON_RESET = 1360;  // +85°C: Factory default
constexpr int16_t DS18B20_RAW_MIN_VALID = -880;       // -55°C: Datasheet minimum
constexpr int16_t DS18B20_RAW_MAX_VALID = 2000;       // +125°C: Datasheet maximum

// Track first reading per sensor (key: gpio_romcode, value: reading count)
static std::map<String, uint32_t> ds18b20_reading_counts;

// ============================================
// GLOBAL INSTANCE
// ============================================
SensorManager& sensorManager = SensorManager::getInstance();

// ============================================
// CONSTRUCTOR / DESTRUCTOR
// ============================================
SensorManager::SensorManager()
    : sensor_count_(0),
      initialized_(false),
      pi_processor_(nullptr),
      mqtt_client_(nullptr),
      i2c_bus_(nullptr),
      onewire_bus_(nullptr),
      gpio_manager_(nullptr),
      last_measurement_time_(0),
      measurement_interval_(30000) {}  // 30s default interval

SensorManager::~SensorManager() {
    end();
}

// ============================================
// LIFECYCLE: INITIALIZATION
// ============================================
bool SensorManager::begin() {
    if (initialized_) {
        LOG_W(TAG, "Sensor Manager already initialized");
        return true;
    }

    LOG_I(TAG, "Sensor Manager initialization started (Phase 4)");
    
    // Get component references
    pi_processor_ = &PiEnhancedProcessor::getInstance();
    mqtt_client_ = &MQTTClient::getInstance();
    i2c_bus_ = &I2CBusManager::getInstance();
    onewire_bus_ = &OneWireBusManager::getInstance();
    gpio_manager_ = &GPIOManager::getInstance();
    
    // Initialize PiEnhancedProcessor
    if (!pi_processor_->begin()) {
        LOG_E(TAG, "Sensor Manager: PiEnhancedProcessor initialization failed");
        errorTracker.trackError(ERROR_SENSOR_INIT_FAILED, ERROR_SEVERITY_ERROR,
                               "PiEnhancedProcessor initialization failed");
        return false;
    }
    
    // Reset sensor registry
    sensor_count_ = 0;
    for (uint8_t i = 0; i < MAX_SENSORS; i++) {
        sensors_[i].gpio = 255;
        sensors_[i].active = false;
    }
    
    initialized_ = true;
    last_measurement_time_ = 0;
    
    LOG_I(TAG, "Sensor Manager initialized (Phase 4)");
    
    return true;
}

// ============================================
// LIFECYCLE: DEINITIALIZATION
// ============================================
void SensorManager::end() {
    if (!initialized_) {
        LOG_W(TAG, "Sensor Manager not initialized");
        return;
    }

    // Release GPIO pins for non-I2C sensors only
    // I2C sensor GPIOs are managed by I2CBusManager
    for (uint8_t i = 0; i < sensor_count_; i++) {
        if (sensors_[i].active && sensors_[i].gpio != 255) {
            // Check if this is an I2C sensor
            const SensorCapability* capability = findSensorCapability(sensors_[i].sensor_type);
            bool is_i2c_sensor = (capability != nullptr && capability->is_i2c);

            if (!is_i2c_sensor) {
                gpio_manager_->releasePin(sensors_[i].gpio);
            }
        }
    }

    sensor_count_ = 0;
    initialized_ = false;

    LOG_I(TAG, "Sensor Manager shutdown");
}

// ============================================
// RAW I2C MEASUREMENT (PHASE 3 PREPARATION)
// ============================================
bool SensorManager::performI2CMeasurement(uint8_t device_address, uint8_t reg,
                                          uint8_t* buffer, size_t len) {
    if (!initialized_) {
        LOG_E(TAG, "Sensor Manager not initialized");
        return false;
    }
    
    // Direct pass-through to I2C Bus Manager
    // Phase 4: Add sensor-specific processing
    return i2cBusManager.readRaw(device_address, reg, buffer, len);
}

// ============================================
// RAW ONEWIRE MEASUREMENT (PHASE 3 PREPARATION)
// ============================================
bool SensorManager::performOneWireMeasurement(const uint8_t rom[8], int16_t& raw_value) {
    if (!initialized_) {
        LOG_E(TAG, "Sensor Manager not initialized");
        return false;
    }
    
    // Direct pass-through to OneWire Bus Manager
    // Phase 4: Add sensor-specific processing
    return oneWireBusManager.readRawTemperature(rom, raw_value);
}

// ============================================
// SENSOR CONFIGURATION (PHASE 4)
// ============================================
bool SensorManager::configureSensor(const SensorConfig& config) {
    if (!initialized_) {
        LOG_E(TAG, "Sensor Manager not initialized");
        return false;
    }

    // Validate GPIO
    if (config.gpio == 255) {
        LOG_E(TAG, "Sensor Manager: Invalid GPIO (255)");
        errorTracker.trackError(ERROR_SENSOR_INIT_FAILED, ERROR_SEVERITY_ERROR,
                               "Invalid GPIO for sensor");
        return false;
    }

    // Get sensor capability to determine interface type
    const SensorCapability* capability = findSensorCapability(config.sensor_type);
    bool is_i2c_sensor = (capability != nullptr && capability->is_i2c);

    // Phase 7: Check if sensor already exists (runtime reconfiguration support)
    SensorConfig* existing = findSensorConfig(config.gpio);
    if (existing) {
        // For I2C sensors: Also check if same sensor type exists on same I2C address
        // (Multi-value sensors like SHT31 share GPIO but have different sensor_types)
        if (is_i2c_sensor && existing->sensor_type != config.sensor_type) {
            // Check if this is a multi-value sensor on same device
            const SensorCapability* existing_cap = findSensorCapability(existing->sensor_type);
            if (existing_cap && existing_cap->is_i2c &&
                existing_cap->i2c_address == capability->i2c_address &&
                String(existing_cap->device_type) == String(capability->device_type)) {
                // Same I2C device, different value type - this is allowed
                // Find an empty slot for the new sensor type
                if (sensor_count_ >= MAX_SENSORS) {
                    LOG_E(TAG, "Sensor Manager: Maximum sensor count reached");
                    return false;
                }

                // Add as new sensor (multi-value support)
                sensors_[sensor_count_] = config;
                sensors_[sensor_count_].active = true;
                sensors_[sensor_count_].i2c_address = capability->i2c_address;  // Store I2C address
                sensor_count_++;

                if (!configManager.saveSensorConfig(config)) {
                    LOG_E(TAG, "Sensor Manager: Failed to persist sensor config to NVS");
                } else {
                    LOG_I(TAG, "  ✅ Configuration persisted to NVS");
                }

                LOG_I(TAG, "Sensor Manager: Added multi-value sensor '" + config.sensor_type +
                         "' on GPIO " + String(config.gpio) + " (I2C 0x" +
                         String(capability->i2c_address, HEX) + ")");
                return true;
            }
        }

        // Runtime reconfiguration: Update existing sensor
        LOG_I(TAG, "Sensor Manager: Updating existing sensor on GPIO " + String(config.gpio));

        // Check if sensor type changed
        bool type_changed = (existing->sensor_type != config.sensor_type);
        if (type_changed) {
            LOG_I(TAG, "  Sensor type changed: " + existing->sensor_type + " → " + config.sensor_type);
        }

        // Update configuration
        *existing = config;
        existing->active = true;

        // Phase 7: Persist to NVS immediately
        if (!configManager.saveSensorConfig(config)) {
            LOG_E(TAG, "Sensor Manager: Failed to persist sensor config to NVS");
        } else {
            LOG_I(TAG, "  ✅ Configuration persisted to NVS");
        }

        LOG_I(TAG, "Sensor Manager: Updated sensor on GPIO " + String(config.gpio) +
                 " (" + config.sensor_type + ")");
        return true;
    }

    // New sensor: Check if we have space
    if (sensor_count_ >= MAX_SENSORS) {
        LOG_E(TAG, "Sensor Manager: Maximum sensor count reached");
        errorTracker.trackError(ERROR_SENSOR_INIT_FAILED, ERROR_SEVERITY_ERROR,
                               "Maximum sensor count reached");
        return false;
    }

    // ============================================
    // INTERFACE-SPECIFIC CONFIGURATION
    // ============================================
    if (is_i2c_sensor) {
        // I2C Sensor: Use I2C bus, NO GPIO reservation needed
        // GPIO 21/22 are already reserved by I2CBusManager as "system"/"I2C_SDA"/"I2C_SCL"

        // Check 1: I2C bus must be initialized
        if (!i2c_bus_->isInitialized()) {
            LOG_E(TAG, "Sensor Manager: I2C bus not initialized");
            errorTracker.trackError(ERROR_I2C_INIT_FAILED, ERROR_SEVERITY_ERROR,
                                   "I2C bus not initialized for I2C sensor");
            return false;
        }

        // Check 2: I2C address conflict detection
        // (Different device type on same I2C address = conflict)
        uint8_t i2c_address = capability->i2c_address;
        for (uint8_t i = 0; i < sensor_count_; i++) {
            if (!sensors_[i].active) continue;

            const SensorCapability* existing_cap = findSensorCapability(sensors_[i].sensor_type);
            if (existing_cap && existing_cap->is_i2c &&
                existing_cap->i2c_address == i2c_address) {
                // Same I2C address - check if same device type (allowed for multi-value)
                if (String(existing_cap->device_type) != String(capability->device_type)) {
                    LOG_E(TAG, "Sensor Manager: I2C address 0x" + String(i2c_address, HEX) +
                              " already in use by different device type '" +
                              String(existing_cap->device_type) + "'");
                    errorTracker.trackError(ERROR_I2C_DEVICE_NOT_FOUND, ERROR_SEVERITY_ERROR,
                                           "I2C address conflict");
                    return false;
                }
                // Same device type on same address is OK (multi-value sensor)
            }
        }

        // Optional: Check if I2C device is present (skip in simulation)
        if (!i2c_bus_->isDevicePresent(i2c_address)) {
            LOG_W(TAG, "Sensor Manager: I2C device at 0x" + String(i2c_address, HEX) +
                        " not responding (may be simulation mode)");
            // Don't fail - Wokwi simulation doesn't have real I2C devices
        }

        // Add I2C sensor (NO GPIO reservation!)
        sensors_[sensor_count_] = config;
        sensors_[sensor_count_].active = true;
        sensors_[sensor_count_].i2c_address = i2c_address;  // Store I2C address for MQTT payload
        sensor_count_++;

        if (!configManager.saveSensorConfig(config)) {
            LOG_E(TAG, "Sensor Manager: Failed to persist sensor config to NVS");
        } else {
            LOG_I(TAG, "  ✅ Configuration persisted to NVS");
        }

        LOG_I(TAG, "Sensor Manager: Configured I2C sensor '" + config.sensor_type +
                 "' at address 0x" + String(i2c_address, HEX) +
                 " (GPIO " + String(config.gpio) + " is I2C bus)" +
                 " [sensor_count=" + String(sensor_count_) + ", active=true]");

        return true;
    }

    // Non-I2C sensor (Analog, Digital, OneWire): Standard GPIO reservation
    // Server-Centric Deviation (Hardware-Protection-Layer):
    // GPIO-Conflict-Check als Defense-in-Depth (siehe actuator_manager.cpp).
    
    // ============================================
    // ONEWIRE SENSOR HANDLING (DS18B20, DS18S20, DS1822)
    // ============================================
    // OneWire sensors share a single bus pin - special GPIO handling required
    // Defense-in-Depth: case-insensitive check (main entry points normalize,
    // but direct indexOf needs protection against mixed-case sensor_type)
    String lower_sensor_type = config.sensor_type;
    lower_sensor_type.toLowerCase();
    bool is_onewire = (capability && !capability->is_i2c &&
                       lower_sensor_type.indexOf("ds18b20") >= 0);
    
    if (is_onewire) {
        LOG_D(TAG, "SensorManager: OneWire sensor detected: " + config.sensor_type);
        
        // 1. Validate ROM-Code format (must be 16 hex chars)
        if (config.onewire_address.length() != 16) {
            LOG_E(TAG, "SensorManager: Invalid OneWire ROM-Code length (expected 16, got " + 
                     String(config.onewire_address.length()) + ")");
            errorTracker.trackError(ERROR_SENSOR_INIT_FAILED, ERROR_SEVERITY_ERROR,
                                   "Invalid OneWire ROM-Code length");
            return false;
        }
        
        // 2. Parse and validate ROM-Code
        uint8_t rom[8];
        if (!OneWireUtils::hexStringToRom(config.onewire_address, rom)) {
            LOG_E(TAG, "SensorManager: Failed to parse OneWire ROM-Code: " + 
                     config.onewire_address);
            errorTracker.trackError(ERROR_SENSOR_INIT_FAILED, ERROR_SEVERITY_ERROR,
                                   "Failed to parse OneWire ROM-Code");
            return false;
        }
        
        if (!OneWireUtils::isValidRom(rom)) {
            // CRC invalid - log as WARNING (may be transmission error) but continue
            // Server can do additional validation if needed
            LOG_W(TAG, "SensorManager: OneWire ROM-Code CRC invalid: " + 
                       config.onewire_address + " - continuing anyway (server will validate)");
            errorTracker.trackError(ERROR_ONEWIRE_INVALID_ROM_CRC, ERROR_SEVERITY_WARNING,
                                   ("ROM CRC invalid: " + config.onewire_address).c_str());
            // Don't return false - CRC errors are warnings, not hard failures
        }
        
        // 2b. Duplicate ROM-Code Check (prevent same device being registered twice)
        for (uint8_t i = 0; i < sensor_count_; i++) {
            if (sensors_[i].onewire_address == config.onewire_address) {
                LOG_E(TAG, "SensorManager: OneWire ROM-Code already registered: " + 
                         config.onewire_address + " on GPIO " + String(sensors_[i].gpio));
                errorTracker.trackError(ERROR_ONEWIRE_DUPLICATE_ROM, ERROR_SEVERITY_ERROR,
                                       ("Duplicate ROM: " + config.onewire_address).c_str());
                return false;
            }
        }
        
        // 3. GPIO-Sharing Check (3 cases for shared OneWire bus)
        // Owner convention: "bus/onewire/{gpio}" for shared bus pins
        String owner = gpio_manager_->getPinOwner(config.gpio);

        if (owner.length() == 0) {
            // CASE A: Pin free → Bus will be initialized below (which reserves the pin)
            // No explicit reservation here - OneWireBusManager::begin() handles it
            LOG_D(TAG, "SensorManager: GPIO " + String(config.gpio) +
                     " is free, OneWire bus will reserve it");
        } else if (owner.startsWith("bus/onewire/")) {
            // CASE B: OneWire bus already exists → Sharing allowed
            // No new requestPin() needed - bus already owns the GPIO
            LOG_I(TAG, "SensorManager: Using existing OneWire bus on GPIO " + String(config.gpio) +
                    " (owner: " + owner + ")");
        } else {
            // CASE C: Pin used by something else → Conflict
            LOG_E(TAG, "SensorManager: GPIO " + String(config.gpio) +
                     " already in use by: " + owner +
                     " (expected: free or bus/onewire/" + String(config.gpio) + ")");
            errorTracker.trackError(ERROR_GPIO_CONFLICT, ERROR_SEVERITY_ERROR,
                                   "GPIO conflict for OneWire sensor");
            return false;
        }
        
        // 4. Single-Bus Check (architecture allows only one OneWire bus)
        if (onewire_bus_->isInitialized()) {
            uint8_t current_pin = onewire_bus_->getPin();
            if (current_pin != config.gpio) {
                LOG_E(TAG, "SensorManager: OneWire bus already active on GPIO " + 
                         String(current_pin) + ", cannot use GPIO " + String(config.gpio) + 
                         " (single-bus architecture)");
                errorTracker.trackError(ERROR_ONEWIRE_INIT_FAILED, ERROR_SEVERITY_ERROR,
                                       "Single-bus conflict");
                return false;
            }
            LOG_D(TAG, "SensorManager: OneWire bus already initialized on GPIO " + 
                     String(current_pin));
        } else {
            // First OneWire sensor → Initialize bus
            if (!onewire_bus_->begin(config.gpio)) {
                LOG_E(TAG, "SensorManager: Failed to initialize OneWire bus on GPIO " + 
                         String(config.gpio));
                errorTracker.trackError(ERROR_ONEWIRE_INIT_FAILED, ERROR_SEVERITY_ERROR,
                                       "OneWire bus init failed");
                return false;
            }
            LOG_I(TAG, "SensorManager: OneWire bus initialized on GPIO " + String(config.gpio));
        }
        
        // 5. Verify device presence on bus
        if (!onewire_bus_->isDevicePresent(rom)) {
            LOG_E(TAG, "SensorManager: OneWire device " + config.onewire_address + 
                     " not found on bus (GPIO " + String(config.gpio) + ")");
            errorTracker.trackError(ERROR_ONEWIRE_NO_DEVICES, ERROR_SEVERITY_ERROR,
                                   "OneWire device not found");
            return false;
        }
        
        LOG_I(TAG, "SensorManager: OneWire device " + config.onewire_address + 
                " verified on GPIO " + String(config.gpio) + 
                " (type: " + OneWireUtils::getDeviceType(rom) + ")");
                
        // Skip standard GPIO reservation (already handled above)
    } else {
        // ============================================
        // STANDARD GPIO SENSOR (Analog, Digital)
        // ============================================
        // Check GPIO availability
        if (!gpio_manager_->isPinAvailable(config.gpio)) {
            LOG_E(TAG, "Sensor Manager: GPIO " + String(config.gpio) + " not available");
            errorTracker.trackError(ERROR_GPIO_CONFLICT, ERROR_SEVERITY_ERROR,
                                   "GPIO conflict for sensor");
            return false;
        }

        // Reserve GPIO
        if (!gpio_manager_->requestPin(config.gpio, "sensor", config.sensor_name.c_str())) {
            LOG_E(TAG, "Sensor Manager: Failed to reserve GPIO " + String(config.gpio));
            errorTracker.trackError(ERROR_GPIO_RESERVED, ERROR_SEVERITY_ERROR,
                                   "Failed to reserve GPIO");
            return false;
        }
    }

    // Add sensor
    sensors_[sensor_count_] = config;
    sensors_[sensor_count_].active = true;
    sensor_count_++;

    // Phase 7: Persist to NVS immediately
    if (!configManager.saveSensorConfig(config)) {
        LOG_E(TAG, "Sensor Manager: Failed to persist sensor config to NVS");
    } else {
        LOG_I(TAG, "  ✅ Configuration persisted to NVS");
    }

    LOG_I(TAG, "Sensor Manager: Configured " + String(is_onewire ? "OneWire" : "GPIO") + 
             " sensor '" + config.sensor_type + "' on GPIO " + String(config.gpio));

    return true;
}

bool SensorManager::removeSensor(uint8_t gpio) {
    if (!initialized_) {
        LOG_E(TAG, "Sensor Manager not initialized");
        return false;
    }

    SensorConfig* config = findSensorConfig(gpio);
    if (!config) {
        LOG_W(TAG, "Sensor Manager: Sensor on GPIO " + String(gpio) + " not found");
        return false;
    }

    LOG_I(TAG, "Sensor Manager: Removing sensor on GPIO " + String(gpio));

    // Check if this is an I2C sensor (don't release GPIO - managed by I2CBusManager)
    const SensorCapability* capability = findSensorCapability(config->sensor_type);
    bool is_i2c_sensor = (capability != nullptr && capability->is_i2c);

    if (!is_i2c_sensor) {
        // Non-I2C sensor: Release GPIO
        gpio_manager_->releasePin(gpio);
        LOG_I(TAG, "  ✅ GPIO " + String(gpio) + " released");
    } else {
        LOG_I(TAG, "  ℹ️ I2C sensor - GPIO managed by I2C bus");
    }

    // Remove sensor (shift array)
    for (uint8_t i = 0; i < sensor_count_; i++) {
        if (sensors_[i].gpio == gpio) {
            // Shift remaining sensors
            for (uint8_t j = i; j < sensor_count_ - 1; j++) {
                sensors_[j] = sensors_[j + 1];
            }
            sensor_count_--;
            sensors_[sensor_count_].gpio = 255;
            sensors_[sensor_count_].active = false;
            break;
        }
    }

    // Phase 7: Persist removal to NVS immediately
    if (!configManager.removeSensorConfig(gpio)) {
        LOG_E(TAG, "Sensor Manager: Failed to remove sensor config from NVS");
    } else {
        LOG_I(TAG, "  ✅ Configuration removed from NVS");
    }

    LOG_I(TAG, "Sensor Manager: Removed sensor on GPIO " + String(gpio));
    return true;
}

SensorConfig SensorManager::getSensorConfig(uint8_t gpio) const {
    SensorConfig empty_config;
    empty_config.gpio = 255;
    
    if (!initialized_) {
        return empty_config;
    }
    
    const SensorConfig* config = findSensorConfig(gpio);
    if (config) {
        return *config;
    }
    
    return empty_config;
}

bool SensorManager::hasSensorOnGPIO(uint8_t gpio) const {
    return findSensorConfig(gpio) != nullptr;
}

uint8_t SensorManager::getActiveSensorCount() const {
    if (!initialized_) {
        LOG_D(TAG, "getActiveSensorCount: NOT initialized, returning 0");
        return 0;
    }

    uint8_t count = 0;
    for (uint8_t i = 0; i < sensor_count_; i++) {
        if (sensors_[i].active) {
            count++;
        }
    }
    LOG_D(TAG, "getActiveSensorCount: sensor_count_=" + String(sensor_count_) + ", active=" + String(count));
    return count;
}

// ============================================
// SENSOR READING (PHASE 4)
// ============================================
bool SensorManager::performMeasurement(uint8_t gpio, SensorReading& reading_out) {
    if (!initialized_) {
        LOG_E(TAG, "Sensor Manager not initialized");
        return false;
    }
    
    // Find sensor config
    SensorConfig* config = findSensorConfig(gpio);
    if (!config || !config->active) {
        LOG_W(TAG, "Sensor Manager: Sensor on GPIO " + String(gpio) + " not found or inactive");
        return false;
    }
    
    // Read raw value based on sensor type (using registry for dynamic detection)
    uint32_t raw_value = 0;
    
    // Get sensor capability from registry
    const SensorCapability* capability = findSensorCapability(config->sensor_type);
    
    if (capability) {
        // Known sensor type - use capability information
        if (capability->is_i2c) {
            // I2C sensor - read from I2C bus
            uint8_t buffer[6] = {0};
            uint8_t device_addr = capability->i2c_address;
            
            // For SHT31, read 6 bytes (temp MSB, temp LSB, CRC, hum MSB, hum LSB, CRC)
            // For other I2C sensors, adjust buffer size as needed
            if (readRawI2C(gpio, device_addr, 0x00, buffer, 6)) {
                // Extract raw value based on sensor type
                // Defense-in-Depth: case-insensitive check
                String lower_type_check = config->sensor_type;
                lower_type_check.toLowerCase();
                if (lower_type_check.indexOf("sht31") >= 0) {
                    // SHT31: First 2 bytes are temperature (for temp sensor)
                    // For humidity, bytes 3-4 would be used (handled separately)
                    raw_value = (uint32_t)(buffer[0] << 8 | buffer[1]);
                } else {
                    // Generic I2C: Use first 2 bytes
                    raw_value = (uint32_t)(buffer[0] << 8 | buffer[1]);
                }
            } else {
                reading_out.valid = false;
                reading_out.error_message = "I2C read failed";
                return false;
            }
        } else {
            // Non-I2C sensor - check device type
            String device_type = String(capability->device_type);
            
            if (device_type == "ds18b20") {
                // ============================================
                // ONEWIRE SENSOR (DS18B20) - Enhanced with Retry + Sanity
                // ============================================
                
                // 1. Validate ROM-Code presence
                if (config->onewire_address.length() != 16) {
                    reading_out.valid = false;
                    reading_out.error_message = "OneWire ROM-Code missing or invalid length";
                    LOG_E(TAG, "SensorManager: DS18B20 ROM-Code missing for GPIO " + String(gpio));
                    errorTracker.trackError(ERROR_ONEWIRE_INVALID_ROM_LENGTH, ERROR_SEVERITY_ERROR,
                                           "ROM-Code missing for measurement");
                    return false;
                }
                
                // 2. Parse ROM-Code
                uint8_t rom[8];
                if (!OneWireUtils::hexStringToRom(config->onewire_address, rom)) {
                    reading_out.valid = false;
                    reading_out.error_message = "OneWire ROM-Code parse failed";
                    LOG_E(TAG, "SensorManager: Failed to parse ROM-Code: " + config->onewire_address);
                    errorTracker.trackError(ERROR_ONEWIRE_INVALID_ROM_FORMAT, ERROR_SEVERITY_ERROR,
                                           ("ROM parse failed: " + config->onewire_address).c_str());
                    return false;
                }
                
                // 3. Check OneWire bus status
                if (!onewire_bus_ || !onewire_bus_->isInitialized()) {
                    reading_out.valid = false;
                    reading_out.error_message = "OneWire bus not initialized";
                    LOG_E(TAG, "SensorManager: OneWire bus not ready for measurement");
                    errorTracker.trackError(ERROR_ONEWIRE_BUS_NOT_INITIALIZED, ERROR_SEVERITY_ERROR,
                                           "Bus not initialized for read");
                    return false;
                }
                
                // 4. Read RAW temperature with RETRY LOGIC (3 attempts, 100ms delay)
                int16_t raw_temp = 0;
                bool read_success = false;
                const uint8_t MAX_RETRIES = 3;
                const uint16_t RETRY_DELAY_MS = 100;
                
                for (uint8_t retry = 0; retry < MAX_RETRIES; retry++) {
                    if (readRawOneWire(gpio, rom, raw_temp)) {
                        read_success = true;
                        if (retry > 0) {
                            LOG_I(TAG, "SensorManager: OneWire read succeeded on attempt " + 
                                    String(retry + 1) + " for " + config->onewire_address);
                        }
                        break;
                    }
                    
                    if (retry < MAX_RETRIES - 1) {
                        LOG_W(TAG, "SensorManager: OneWire read attempt " + String(retry + 1) + 
                                   " failed for " + config->onewire_address + ", retrying...");
                        delay(RETRY_DELAY_MS);
                    }
                }
                
                if (!read_success) {
                    reading_out.valid = false;
                    reading_out.error_message = "OneWire read failed after " + String(MAX_RETRIES) + " attempts";
                    LOG_E(TAG, "SensorManager: OneWire read failed after " + String(MAX_RETRIES) +
                             " retries for device " + config->onewire_address + " on GPIO " + String(gpio));
                    errorTracker.trackError(ERROR_ONEWIRE_READ_TIMEOUT, ERROR_SEVERITY_ERROR,
                                           ("Read timeout: " + config->onewire_address).c_str());
                    return false;
                }

                // ============================================
                // 5. DS18B20 SPECIAL VALUE DETECTION (Defense-in-Depth)
                // ============================================
                // Track readings per sensor for power-on-reset detection
                String sensor_key = String(gpio) + "_" + config->onewire_address;
                uint32_t reading_count = ds18b20_reading_counts[sensor_key]++;

                // 5a. SENSOR FAULT: -127°C (RAW = -2032)
                // This indicates: disconnected sensor, CRC failure, or bus error
                // CRITICAL: Do NOT publish this value - it's not a temperature!
                if (raw_temp == DS18B20_RAW_SENSOR_FAULT) {
                    LOG_E(TAG, "SensorManager: DS18B20 SENSOR FAULT detected: -127°C (GPIO " +
                              String(gpio) + ", ROM: " + config->onewire_address + ")");
                    LOG_E(TAG, "  → Possible causes: Sensor disconnected, CRC failure, bus wiring issue");

                    errorTracker.trackError(
                        ERROR_DS18B20_SENSOR_FAULT,
                        ERROR_SEVERITY_ERROR,
                        ("DS18B20 fault (-127°C) on GPIO " + String(gpio) +
                         " ROM " + config->onewire_address).c_str()
                    );

                    // Do NOT publish - error is reported via ErrorTracker (dedicated MQTT topic)
                    reading_out.valid = false;
                    reading_out.error_message = "DS18B20 sensor fault: -127°C (disconnected or CRC failure)";
                    reading_out.quality = "error";
                    return false;
                }

                // 5b. POWER-ON-RESET: 85°C (RAW = 1360) - ONLY on first reading
                // After power-up, DS18B20 reports 85°C until first conversion completes
                // CRITICAL: Only reject on FIRST reading; after that, 85°C could be real (fire!)
                if (raw_temp == DS18B20_RAW_POWER_ON_RESET && reading_count == 0) {
                    LOG_W(TAG, "SensorManager: DS18B20 power-on reset detected: 85°C (GPIO " +
                               String(gpio) + ", ROM: " + config->onewire_address + ")");
                    LOG_I(TAG, "  → First reading after boot - triggering retry with conversion delay...");

                    // Wait for conversion to complete (750ms for 12-bit resolution)
                    delay(100);  // Short delay, then retry

                    // Retry the read
                    int16_t retry_raw = 0;
                    if (readRawOneWire(gpio, rom, retry_raw)) {
                        if (retry_raw == DS18B20_RAW_POWER_ON_RESET) {
                            // Still 85°C after retry - accept it (could be fire or faulty sensor)
                            LOG_W(TAG, "SensorManager: DS18B20 still 85°C after retry - accepting as potentially valid");
                            raw_temp = retry_raw;
                            // Fall through to normal processing
                        } else if (retry_raw == DS18B20_RAW_SENSOR_FAULT) {
                            // Retry returned fault
                            LOG_E(TAG, "SensorManager: DS18B20 retry returned sensor fault (-127°C)");
                            errorTracker.trackError(
                                ERROR_DS18B20_SENSOR_FAULT,
                                ERROR_SEVERITY_ERROR,
                                ("DS18B20 fault after power-on retry on GPIO " + String(gpio)).c_str()
                            );
                            reading_out.valid = false;
                            reading_out.error_message = "DS18B20 sensor fault after power-on retry";
                            reading_out.quality = "error";
                            return false;
                        } else {
                            // Good value on retry
                            LOG_I(TAG, "SensorManager: DS18B20 retry successful: " +
                                    String(retry_raw * 0.0625) + "°C (was power-on 85°C)");
                            raw_temp = retry_raw;
                        }
                    } else {
                        // Retry read failed
                        LOG_E(TAG, "SensorManager: DS18B20 retry read failed after power-on reset");
                        errorTracker.trackError(
                            ERROR_DS18B20_POWER_ON_RESET,
                            ERROR_SEVERITY_WARNING,
                            ("DS18B20 power-on reset, retry failed on GPIO " + String(gpio)).c_str()
                        );
                        reading_out.valid = false;
                        reading_out.error_message = "DS18B20 retry failed after power-on reset";
                        reading_out.quality = "error";
                        return false;
                    }
                }

                // 5c. RANGE VALIDATION: Check datasheet limits (-55°C to +125°C)
                if (raw_temp < DS18B20_RAW_MIN_VALID || raw_temp > DS18B20_RAW_MAX_VALID) {
                    LOG_W(TAG, "SensorManager: DS18B20 raw value " + String(raw_temp) +
                               " (" + String(raw_temp * 0.0625) + "°C) out of datasheet range " +
                               "[" + String(DS18B20_RAW_MIN_VALID) + ", " + String(DS18B20_RAW_MAX_VALID) +
                               "] for " + config->onewire_address);

                    errorTracker.trackError(
                        ERROR_DS18B20_OUT_OF_RANGE,
                        ERROR_SEVERITY_WARNING,
                        ("DS18B20 out of range: " + String(raw_temp * 0.0625) + "°C").c_str()
                    );

                    reading_out.quality = "suspect";  // Server decides whether to use
                } else {
                    reading_out.quality = "good";
                }
                
                // 6. Store RAW value and metadata for MQTT payload
                raw_value = (uint32_t)raw_temp;
                reading_out.onewire_address = config->onewire_address;
                reading_out.raw_mode = true;  // Always true for DS18B20 (Server-Centric)
                
                LOG_D(TAG, "SensorManager: DS18B20 read: " + config->onewire_address + 
                         " = " + String(raw_temp) + " RAW (GPIO " + String(gpio) + 
                         ", quality=" + reading_out.quality + ")");
            } else {
                // Analog sensor (pH, EC, Moisture, etc.)
                raw_value = readRawAnalog(gpio);
            }
        }
    } else {
        // Unknown sensor type - try to infer from sensor_type string
        String lower_type = config->sensor_type;
        lower_type.toLowerCase();
        
        if (lower_type.indexOf("ph") >= 0 || lower_type.indexOf("ec") >= 0 || 
            lower_type.indexOf("moisture") >= 0) {
            // Likely analog sensor
            raw_value = readRawAnalog(gpio);
        } else if (lower_type.indexOf("ds18b20") >= 0 || lower_type.indexOf("onewire") >= 0) {
            // Likely OneWire sensor - use ROM-Code from config
            if (config->onewire_address.length() != 16) {
                reading_out.valid = false;
                reading_out.error_message = "OneWire ROM-Code missing";
                LOG_E(TAG, "SensorManager: DS18B20 ROM-Code missing (fallback path)");
                return false;
            }
            
            uint8_t rom[8];
            if (!OneWireUtils::hexStringToRom(config->onewire_address, rom)) {
                reading_out.valid = false;
                reading_out.error_message = "OneWire ROM-Code parse failed";
                return false;
            }
            
            int16_t raw_temp = 0;
            if (readRawOneWire(gpio, rom, raw_temp)) {
                raw_value = (uint32_t)raw_temp;
                reading_out.onewire_address = config->onewire_address;
            } else {
                reading_out.valid = false;
                reading_out.error_message = "OneWire read failed";
                return false;
            }
        } else if (lower_type.indexOf("i2c") >= 0 || lower_type.indexOf("sht") >= 0 || 
                   lower_type.indexOf("bmp") >= 0) {
            // Likely I2C sensor - try default address
            uint8_t buffer[6] = {0};
            uint8_t device_addr = getI2CAddress(lower_type, 0x44);  // Default to SHT31 address
            if (readRawI2C(gpio, device_addr, 0x00, buffer, 6)) {
                raw_value = (uint32_t)(buffer[0] << 8 | buffer[1]);
            } else {
                reading_out.valid = false;
                reading_out.error_message = "I2C read failed";
                return false;
            }
        } else {
            // Fallback: try analog
            raw_value = readRawAnalog(gpio);
        }
    }
    
    // Normalize sensor type for server (ESP32 → Server Processor)
    String server_sensor_type = getServerSensorType(config->sensor_type);
    
    // Send raw data to Pi for processing
    RawSensorData raw_data;
    raw_data.gpio = gpio;
    raw_data.sensor_type = server_sensor_type;  // Use normalized type
    raw_data.raw_value = raw_value;
    raw_data.timestamp = millis();
    raw_data.metadata = "{}";
    
    ProcessedSensorData processed;
    bool success = pi_processor_->sendRawData(raw_data, processed);
    
    // Fill reading output (use normalized sensor type)
    reading_out.gpio = gpio;
    reading_out.sensor_type = server_sensor_type;  // Use normalized type
    reading_out.subzone_id = config->subzone_id;
    reading_out.raw_value = raw_value;
    reading_out.processed_value = processed.value;
    reading_out.unit = processed.unit;
    reading_out.quality = processed.quality;
    reading_out.timestamp = millis();
    reading_out.valid = processed.valid;
    reading_out.error_message = processed.error_message;
    reading_out.i2c_address = config->i2c_address;  // Copy I2C address for MQTT payload
    
    // Update config
    config->last_raw_value = raw_value;
    config->last_reading = millis();
    
    return success;
}

// ============================================
// MULTI-VALUE SENSOR MEASUREMENT (PHASE 5)
// ============================================
uint8_t SensorManager::performMultiValueMeasurement(uint8_t gpio, SensorReading* readings_out, uint8_t max_readings) {
    if (!initialized_ || readings_out == nullptr || max_readings == 0) {
        return 0;
    }
    
    // Find sensor config
    SensorConfig* config = findSensorConfig(gpio);
    if (!config || !config->active) {
        LOG_W(TAG, "Sensor Manager: Sensor on GPIO " + String(gpio) + " not found or inactive");
        return 0;
    }
    
    // Get sensor capability
    const SensorCapability* capability = findSensorCapability(config->sensor_type);
    if (!capability || !capability->is_multi_value) {
        LOG_W(TAG, "Sensor Manager: Sensor on GPIO " + String(gpio) + " is not a multi-value sensor");
        return 0;
    }
    
    // Get device type and all value types
    String device_type = String(capability->device_type);
    String value_types[4];
    uint8_t value_count = getMultiValueTypes(device_type, value_types, 4);
    
    if (value_count == 0 || value_count > max_readings) {
        LOG_E(TAG, "Sensor Manager: Invalid value count for multi-value sensor");
        return 0;
    }
    
    // Read raw data from sensor (I2C for SHT31/BMP280)
    if (!capability->is_i2c) {
        LOG_E(TAG, "Sensor Manager: Multi-value sensor must be I2C");
        return 0;
    }

    // ============================================
    // UNIFIED I2C MULTI-VALUE SENSOR READING
    // ============================================
    // Uses protocol-aware readSensorRaw() for all I2C sensors
    // Protocol selection is automatic based on device_type
    // One I2C read for ALL values (no duplicate transactions)
    uint8_t buffer[16] = {0};  // Buffer for multi-value sensors (up to 8 bytes for BME280)
    uint8_t device_addr = capability->i2c_address;
    size_t bytes_read = 0;

    LOG_I(TAG, "SensorManager: I2C READ START for " + device_type + " addr=0x" + String(device_addr, HEX));
    if (!i2c_bus_->readSensorRaw(device_type, device_addr, buffer, sizeof(buffer), bytes_read)) {
        LOG_E(TAG, "Sensor Manager: I2C read failed for " + device_type);
        return 0;
    }
    LOG_I(TAG, "SensorManager: I2C READ COMPLETE, bytes=" + String(bytes_read));

    LOG_D(TAG, "Sensor Manager: " + device_type + " raw data (" + String(bytes_read) + " bytes): " +
              String(buffer[0], HEX) + " " + String(buffer[1], HEX) + " " +
              String(buffer[2], HEX) + " " + String(buffer[3], HEX) + " " +
              String(buffer[4], HEX) + " " + String(buffer[5], HEX));
    
    // Create readings for each value type
    uint8_t created_count = 0;
    
    for (uint8_t i = 0; i < value_count; i++) {
        SensorReading& reading = readings_out[created_count];
        
        // Extract raw value using protocol definition
        // This uses the I2CSensorProtocol registry to correctly parse
        // multi-value sensor responses based on byte offsets and endianness
        String value_type = value_types[i];
        uint32_t raw_value = extractRawValue(device_type, value_type, buffer, bytes_read);
        
        // Normalize sensor type
        String server_sensor_type = getServerSensorType(value_type);
        
        // Send raw data to Pi for processing
        RawSensorData raw_data;
        raw_data.gpio = gpio;
        raw_data.sensor_type = server_sensor_type;
        raw_data.raw_value = raw_value;
        raw_data.timestamp = millis();
        raw_data.metadata = "{}";

        LOG_I(TAG, "SensorManager: PiEnhancedProcessor START for " + server_sensor_type + " raw=" + String(raw_value));
        ProcessedSensorData processed;
        bool success = pi_processor_->sendRawData(raw_data, processed);
        LOG_I(TAG, "SensorManager: PiEnhancedProcessor END success=" + String(success ? "YES" : "NO"));
        
        // Fill reading output
        reading.gpio = gpio;
        reading.sensor_type = server_sensor_type;
        reading.subzone_id = config->subzone_id;
        reading.raw_value = raw_value;
        reading.processed_value = processed.value;
        reading.unit = processed.unit;
        reading.quality = processed.quality;
        reading.timestamp = millis();
        reading.valid = processed.valid;
        reading.error_message = processed.error_message;
        reading.i2c_address = config->i2c_address;  // Copy I2C address for MQTT payload
        
        if (success && processed.valid) {
            created_count++;

            // Publish reading via MQTT
            LOG_I(TAG, "SensorManager: MQTT PUBLISH START for " + server_sensor_type);
            publishSensorReading(reading);
            LOG_I(TAG, "SensorManager: MQTT PUBLISH END for " + server_sensor_type);
        } else {
            LOG_I(TAG, "SensorManager: Skipping publish - success=" + String(success ? "YES" : "NO") + " valid=" + String(processed.valid ? "YES" : "NO"));
        }
    }

    // Update config
    config->last_raw_value = readings_out[0].raw_value;  // Use first reading
    config->last_reading = millis();

    LOG_I(TAG, "SensorManager: MULTI-VALUE COMPLETE, created " + String(created_count) + " readings");

    return created_count;
}

// Server-Centric Deviation (Autonomous Measurement Pattern):
// ESP32 misst periodisch autonom (standard in Industrial IoT wie AWS Greengrass, Azure IoT Edge).
// Begründung: Minimiert MQTT-Traffic, Server-Control via measurement_interval Config.
// Dokumentiert in: docs/ZZZ.md - "Server-Centric Pragmatic Deviations"
void SensorManager::performAllMeasurements() {
    if (!initialized_) {
        return;
    }

    // No sensors configured - nothing to do
    if (sensor_count_ == 0) {
        return;
    }

    LOG_D(TAG, "SensorManager::performAllMeasurements() ENTER, sensor_count=" + String(sensor_count_));

    unsigned long now = millis();

    // ✅ Phase 2C: Pro-Sensor Iteration with Mode-Check
    // (Removed global interval check - each sensor has its own interval)
    for (uint8_t i = 0; i < sensor_count_; i++) {
        LOG_D(TAG, "SensorManager: Processing sensor[" + String(i) + "] GPIO=" + String(sensors_[i].gpio) + " type=" + sensors_[i].sensor_type);
        // Check 1: Sensor must be active
        if (!sensors_[i].active) {
            continue;
        }

        // ✅ Phase 2C: Check 2: Operating Mode
        const String& mode = sensors_[i].operating_mode;

        if (mode == "paused") {
            // Paused sensors are never measured automatically
            continue;
        }

        if (mode == "on_demand") {
            // On-demand sensors are only measured via command
            continue;
        }

        if (mode == "scheduled") {
            // Scheduled sensors are measured via server command (Phase 2D)
            continue;
        }

        // ✅ Phase 2C: Check 3: Pro-Sensor Interval
        uint32_t sensor_interval = sensors_[i].measurement_interval_ms;
        if (sensor_interval == 0) {
            sensor_interval = measurement_interval_;  // Fallback to global interval
        }

        // Check if enough time has passed since last measurement
        if (now - sensors_[i].last_reading < sensor_interval) {
            continue;  // Not time for this sensor yet
        }

        // ✅ Continuous Mode: Perform measurement
        // Check if this is a multi-value sensor
        const SensorCapability* capability = findSensorCapability(sensors_[i].sensor_type);
        LOG_D(TAG, "SensorManager: sensor[" + String(i) + "] is_multi_value=" + String(capability && capability->is_multi_value ? "YES" : "NO"));

        if (capability && capability->is_multi_value) {
            // Multi-value sensor - create multiple readings
            LOG_D(TAG, "SensorManager: MULTI-VALUE measurement START GPIO=" + String(sensors_[i].gpio));
            SensorReading readings[4];  // Max 4 values per sensor
            uint8_t count = performMultiValueMeasurement(sensors_[i].gpio, readings, 4);
            LOG_D(TAG, "SensorManager: MULTI-VALUE measurement END count=" + String(count));

            // Readings are already published by performMultiValueMeasurement
            if (count == 0) {
                LOG_W(TAG, "Sensor Manager: Multi-value measurement failed for GPIO " + String(sensors_[i].gpio));
            } else {
                sensors_[i].last_reading = now;  // Update timestamp
            }
        } else {
            // Single-value sensor - standard measurement
            LOG_D(TAG, "SensorManager: SINGLE-VALUE measurement START GPIO=" + String(sensors_[i].gpio));
            SensorReading reading;
            if (performMeasurement(sensors_[i].gpio, reading)) {
                LOG_D(TAG, "SensorManager: SINGLE-VALUE measurement OK, publishing");
                // Publish via MQTT
                publishSensorReading(reading);
                sensors_[i].last_reading = now;  // Update timestamp
            } else {
                LOG_D(TAG, "SensorManager: SINGLE-VALUE measurement FAILED");
            }
        }

        // Feed watchdog between sensor measurements to prevent timeout
        LOG_D(TAG, "SensorManager: sensor[" + String(i) + "] DONE, yielding");
        yield();
    }

    // Update global timestamp for compatibility
    last_measurement_time_ = now;
    LOG_D(TAG, "SensorManager::performAllMeasurements() EXIT");
}

// ============================================
// MEASUREMENT INTERVAL CONFIGURATION (PHASE 2)
// ============================================
void SensorManager::setMeasurementInterval(unsigned long interval_ms) {
    measurement_interval_ = interval_ms;
    LOG_I(TAG, "Measurement interval set to " + String(interval_ms) + " ms");
}

// ============================================
// MANUAL MEASUREMENT (PHASE 2C - On-Demand)
// ============================================
bool SensorManager::triggerManualMeasurement(uint8_t gpio) {
    if (!initialized_) {
        LOG_E(TAG, "SensorManager: Not initialized, cannot trigger manual measurement");
        return false;
    }

    // Find sensor configuration
    SensorConfig* config = findSensorConfig(gpio);
    if (!config) {
        LOG_E(TAG, "SensorManager: Sensor not found on GPIO " + String(gpio));
        return false;
    }

    // Check if sensor is active
    if (!config->active) {
        LOG_W(TAG, "SensorManager: Cannot measure inactive sensor on GPIO " + String(gpio));
        return false;
    }

    LOG_I(TAG, "SensorManager: Manual measurement triggered for GPIO " + String(gpio) +
             " (mode: " + config->operating_mode + ")");

    unsigned long now = millis();

    // Check if this is a multi-value sensor
    const SensorCapability* capability = findSensorCapability(config->sensor_type);

    if (capability && capability->is_multi_value) {
        // Multi-value sensor - create multiple readings
        SensorReading readings[4];  // Max 4 values per sensor
        uint8_t count = performMultiValueMeasurement(gpio, readings, 4);

        if (count == 0) {
            LOG_E(TAG, "SensorManager: Manual multi-value measurement failed for GPIO " + String(gpio));
            return false;
        }

        config->last_reading = now;
        return true;
    } else {
        // Single-value sensor - standard measurement
        SensorReading reading;
        if (performMeasurement(gpio, reading)) {
            publishSensorReading(reading);
            config->last_reading = now;
            return true;
        }

        LOG_E(TAG, "SensorManager: Manual measurement failed for GPIO " + String(gpio));
        return false;
    }
}

// ============================================
// RAW DATA READING METHODS (PHASE 4)
// ============================================
uint32_t SensorManager::readRawAnalog(uint8_t gpio) {
    if (!initialized_) {
        return 0;
    }
    
    // Configure pin as analog input if needed
    gpio_manager_->configurePinMode(gpio, INPUT);
    
    // Read analog value (ESP32: 0-4095)
    return analogRead(gpio);
}

uint32_t SensorManager::readRawDigital(uint8_t gpio) {
    if (!initialized_) {
        return 0;
    }
    
    // Configure pin as digital input if needed
    gpio_manager_->configurePinMode(gpio, INPUT_PULLUP);
    
    // Read digital value
    return digitalRead(gpio);
}

bool SensorManager::readRawI2C(uint8_t gpio, uint8_t device_address, 
                                uint8_t reg, uint8_t* buffer, size_t len) {
    if (!initialized_ || !i2c_bus_) {
        return false;
    }
    
    // Use I2C bus manager
    return i2c_bus_->readRaw(device_address, reg, buffer, len);
}

bool SensorManager::readRawOneWire(uint8_t gpio, const uint8_t rom[8], int16_t& raw_value) {
    if (!initialized_ || !onewire_bus_) {
        LOG_E(TAG, "SensorManager: Not initialized or OneWire bus missing");
        return false;
    }
    
    // Verify OneWire bus is initialized
    if (!onewire_bus_->isInitialized()) {
        LOG_E(TAG, "SensorManager: OneWire bus not initialized");
        return false;
    }
    
    // Verify GPIO matches bus pin (safety check)
    if (onewire_bus_->getPin() != gpio) {
        LOG_E(TAG, "SensorManager: OneWire bus on GPIO " + String(onewire_bus_->getPin()) + 
                 ", requested GPIO " + String(gpio));
        return false;
    }
    
    // Read RAW temperature from device
    if (!onewire_bus_->readRawTemperature(rom, raw_value)) {
        LOG_W(TAG, "SensorManager: Failed to read OneWire device " + 
                   OneWireUtils::romToHexString(rom));
        return false;
    }
    
    return true;
}

// ============================================
// STATUS QUERIES
// ============================================
String SensorManager::getSensorInfo(uint8_t gpio) const {
    const SensorConfig* config = findSensorConfig(gpio);
    if (!config) {
        return "Sensor not found";
    }
    
    String info;
    info.reserve(128);
    info = "GPIO: " + String(config->gpio) + ", Type: " + config->sensor_type + 
           ", Name: " + config->sensor_name + ", Active: " + String(config->active ? "Yes" : "No");
    return info;
}

// ============================================
// HELPER METHODS
// ============================================
SensorConfig* SensorManager::findSensorConfig(uint8_t gpio) {
    for (uint8_t i = 0; i < sensor_count_; i++) {
        if (sensors_[i].gpio == gpio) {
            return &sensors_[i];
        }
    }
    return nullptr;
}

const SensorConfig* SensorManager::findSensorConfig(uint8_t gpio) const {
    for (uint8_t i = 0; i < sensor_count_; i++) {
        if (sensors_[i].gpio == gpio) {
            return &sensors_[i];
        }
    }
    return nullptr;
}

void SensorManager::publishSensorReading(const SensorReading& reading) {
    if (!mqtt_client_ || !mqtt_client_->isConnected()) {
        LOG_W(TAG, "Sensor Manager: MQTT not connected, skipping publish");
        return;
    }
    
    // Build topic
    const char* topic = TopicBuilder::buildSensorDataTopic(reading.gpio);
    
    // Build payload
    String payload = buildMQTTPayload(reading);
    
    // Publish
    if (!mqtt_client_->publish(topic, payload, 1)) {
        LOG_E(TAG, "Sensor Manager: Failed to publish sensor data for GPIO " + String(reading.gpio));
        errorTracker.trackError(ERROR_MQTT_PUBLISH_FAILED, ERROR_SEVERITY_ERROR,
                               "Failed to publish sensor data");
    }
}

String SensorManager::buildMQTTPayload(const SensorReading& reading) const {
    String payload;
    payload.reserve(384);  // Increased for zone info
    
    // Get ESP ID and Zone info from ConfigManager
    ConfigManager& config = ConfigManager::getInstance();
    String esp_id = config.getESPId();
    
    // Phase 7: Get zone information from global variables (extern from main.cpp)
    extern KaiserZone g_kaiser;
    
    // Phase 8: Use NTP-synchronized Unix timestamp
    time_t unix_ts = timeManager.getUnixTimestamp();
    
    // Build JSON payload with zone information and correlation seq
    payload = "{";
    payload += "\"esp_id\":\"";
    payload += esp_id;
    payload += "\",";
    payload += "\"seq\":";
    payload += String(mqtt_client_->getNextSeq());
    payload += ",";
    payload += "\"zone_id\":\"";
    payload += g_kaiser.zone_id;
    payload += "\",";
    payload += "\"subzone_id\":\"";
    payload += reading.subzone_id;  // From sensor config
    payload += "\",";
    payload += "\"gpio\":";
    payload += String(reading.gpio);
    payload += ",";
    payload += "\"sensor_type\":\"";
    payload += reading.sensor_type;
    payload += "\",";
    payload += "\"raw\":";
    payload += String(reading.raw_value);
    payload += ",";
    payload += "\"value\":";
    payload += String(reading.processed_value);
    payload += ",";
    payload += "\"unit\":\"";
    payload += reading.unit;
    payload += "\",";
    payload += "\"quality\":\"";
    payload += reading.quality;
    payload += "\",";
    payload += "\"ts\":";
    payload += String((unsigned long)unix_ts);
    payload += ",";
    
    // raw_mode from Reading (Server-Centric: true = server processes RAW data)
    payload += "\"raw_mode\":";
    payload += (reading.raw_mode ? "true" : "false");
    
    // OneWire Address (for device identification on shared bus)
    if (!reading.onewire_address.isEmpty()) {
        payload += ",\"onewire_address\":\"";
        payload += reading.onewire_address;
        payload += "\"";
    }

    // I2C Address (for device identification when multiple I2C sensors)
    if (reading.i2c_address != 0) {
        payload += ",\"i2c_address\":";
        payload += String(reading.i2c_address);
    }

    // Quality hint (if set by sanity checks)
    if (!reading.quality.isEmpty()) {
        payload += ",\"quality\":\"";
        payload += reading.quality;
        payload += "\"";
    }
    
    payload += "}";
    
    return payload;
}
