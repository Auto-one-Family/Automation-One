#include "sensor_manager.h"
#include "pi_enhanced_processor.h"
#include "../communication/mqtt_client.h"
#include "../config/config_manager.h"
#include "../../drivers/gpio_manager.h"
#include "../../drivers/i2c_bus.h"
#include "../../drivers/onewire_bus.h"
#include "../../utils/topic_builder.h"
#include "../../utils/logger.h"
#include "../../error_handling/error_tracker.h"
#include "../../models/error_codes.h"
#include "../../models/sensor_types.h"

// ============================================
// GLOBAL INSTANCE
// ============================================
SensorManager& sensorManager = SensorManager::getInstance();

// ============================================
// LIFECYCLE: INITIALIZATION
// ============================================
bool SensorManager::begin() {
    if (initialized_) {
        LOG_WARNING("Sensor Manager already initialized");
        return true;
    }

    LOG_INFO("Sensor Manager initialization started (Phase 4)");
    
    // Get component references
    pi_processor_ = &PiEnhancedProcessor::getInstance();
    mqtt_client_ = &MQTTClient::getInstance();
    i2c_bus_ = &I2CBusManager::getInstance();
    onewire_bus_ = &OneWireBusManager::getInstance();
    gpio_manager_ = &GPIOManager::getInstance();
    
    // Initialize PiEnhancedProcessor
    if (!pi_processor_->begin()) {
        LOG_ERROR("Sensor Manager: PiEnhancedProcessor initialization failed");
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
    
    LOG_INFO("Sensor Manager initialized (Phase 4)");
    
    return true;
}

// ============================================
// LIFECYCLE: DEINITIALIZATION
// ============================================
void SensorManager::end() {
    if (!initialized_) {
        LOG_WARNING("Sensor Manager not initialized");
        return;
    }
    
    // Release all GPIO pins
    for (uint8_t i = 0; i < sensor_count_; i++) {
        if (sensors_[i].active && sensors_[i].gpio != 255) {
            gpio_manager_->releasePin(sensors_[i].gpio);
        }
    }
    
    sensor_count_ = 0;
    initialized_ = false;
    
    LOG_INFO("Sensor Manager shutdown");
}

// ============================================
// RAW I2C MEASUREMENT (PHASE 3 PREPARATION)
// ============================================
bool SensorManager::performI2CMeasurement(uint8_t device_address, uint8_t reg,
                                          uint8_t* buffer, size_t len) {
    if (!initialized_) {
        LOG_ERROR("Sensor Manager not initialized");
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
        LOG_ERROR("Sensor Manager not initialized");
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
        LOG_ERROR("Sensor Manager not initialized");
        return false;
    }
    
    // Validate GPIO
    if (config.gpio == 255) {
        LOG_ERROR("Sensor Manager: Invalid GPIO (255)");
        errorTracker.trackError(ERROR_SENSOR_INIT_FAILED, ERROR_SEVERITY_ERROR,
                               "Invalid GPIO for sensor");
        return false;
    }
    
    // Phase 7: Check if sensor already exists (runtime reconfiguration support)
    SensorConfig* existing = findSensorConfig(config.gpio);
    if (existing) {
        // Runtime reconfiguration: Update existing sensor
        LOG_INFO("Sensor Manager: Updating existing sensor on GPIO " + String(config.gpio));
        
        // Check if sensor type changed
        bool type_changed = (existing->sensor_type != config.sensor_type);
        if (type_changed) {
            LOG_INFO("  Sensor type changed: " + existing->sensor_type + " → " + config.sensor_type);
        }
        
        // Update configuration
        *existing = config;
        existing->active = true;
        
        // Phase 7: Persist to NVS immediately
        if (!configManager.saveSensorConfig(config)) {
            LOG_ERROR("Sensor Manager: Failed to persist sensor config to NVS");
        } else {
            LOG_INFO("  ✅ Configuration persisted to NVS");
        }
        
        LOG_INFO("Sensor Manager: Updated sensor on GPIO " + String(config.gpio) + 
                 " (" + config.sensor_type + ")");
        return true;
    }
    
    // New sensor: Check if we have space
    if (sensor_count_ >= MAX_SENSORS) {
        LOG_ERROR("Sensor Manager: Maximum sensor count reached");
        errorTracker.trackError(ERROR_SENSOR_INIT_FAILED, ERROR_SEVERITY_ERROR,
                               "Maximum sensor count reached");
        return false;
    }
    
    // Server-Centric Deviation (Hardware-Protection-Layer):
    // GPIO-Conflict-Check als Defense-in-Depth (siehe actuator_manager.cpp).
    // Check GPIO availability
    if (!gpio_manager_->isPinAvailable(config.gpio)) {
        LOG_ERROR("Sensor Manager: GPIO " + String(config.gpio) + " not available");
        errorTracker.trackError(ERROR_GPIO_CONFLICT, ERROR_SEVERITY_ERROR,
                               "GPIO conflict for sensor");
        return false;
    }
    
    // Reserve GPIO
    if (!gpio_manager_->requestPin(config.gpio, "sensor", config.sensor_name.c_str())) {
        LOG_ERROR("Sensor Manager: Failed to reserve GPIO " + String(config.gpio));
        errorTracker.trackError(ERROR_GPIO_RESERVED, ERROR_SEVERITY_ERROR,
                               "Failed to reserve GPIO");
        return false;
    }
    
    // Add sensor
    sensors_[sensor_count_] = config;
    sensors_[sensor_count_].active = true;
    sensor_count_++;
    
    // Phase 7: Persist to NVS immediately
    if (!configManager.saveSensorConfig(config)) {
        LOG_ERROR("Sensor Manager: Failed to persist sensor config to NVS");
    } else {
        LOG_INFO("  ✅ Configuration persisted to NVS");
    }
    
    LOG_INFO("Sensor Manager: Configured new sensor on GPIO " + String(config.gpio) + 
             " (" + config.sensor_type + ")");
    
    return true;
}

bool SensorManager::removeSensor(uint8_t gpio) {
    if (!initialized_) {
        LOG_ERROR("Sensor Manager not initialized");
        return false;
    }
    
    SensorConfig* config = findSensorConfig(gpio);
    if (!config) {
        LOG_WARNING("Sensor Manager: Sensor on GPIO " + String(gpio) + " not found");
        return false;
    }
    
    LOG_INFO("Sensor Manager: Removing sensor on GPIO " + String(gpio));
    
    // Release GPIO
    gpio_manager_->releasePin(gpio);
    LOG_INFO("  ✅ GPIO " + String(gpio) + " released");
    
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
        LOG_ERROR("Sensor Manager: Failed to remove sensor config from NVS");
    } else {
        LOG_INFO("  ✅ Configuration removed from NVS");
    }
    
    LOG_INFO("Sensor Manager: Removed sensor on GPIO " + String(gpio));
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
        return 0;
    }
    
    uint8_t count = 0;
    for (uint8_t i = 0; i < sensor_count_; i++) {
        if (sensors_[i].active) {
            count++;
        }
    }
    return count;
}

// ============================================
// SENSOR READING (PHASE 4)
// ============================================
bool SensorManager::performMeasurement(uint8_t gpio, SensorReading& reading_out) {
    if (!initialized_) {
        LOG_ERROR("Sensor Manager not initialized");
        return false;
    }
    
    // Find sensor config
    SensorConfig* config = findSensorConfig(gpio);
    if (!config || !config->active) {
        LOG_WARNING("Sensor Manager: Sensor on GPIO " + String(gpio) + " not found or inactive");
        return false;
    }
    
    // Read raw value based on sensor type
    uint32_t raw_value = 0;
    
    if (config->sensor_type == "ph_sensor" || config->sensor_type == "ec_sensor") {
        // Analog sensor
        raw_value = readRawAnalog(gpio);
    } else if (config->sensor_type == "temperature_ds18b20") {
        // OneWire sensor (requires ROM code - simplified for now)
        int16_t raw_temp = 0;
        uint8_t rom[8] = {0};  // TODO: Store ROM code in SensorConfig
        if (readRawOneWire(gpio, rom, raw_temp)) {
            raw_value = (uint32_t)raw_temp;
        } else {
            reading_out.valid = false;
            reading_out.error_message = "OneWire read failed";
            return false;
        }
    } else if (config->sensor_type == "temperature_sht31" || 
               config->sensor_type.startsWith("i2c_")) {
        // I2C sensor (simplified - requires device address and register)
        uint8_t buffer[6] = {0};
        uint8_t device_addr = 0x44;  // Default SHT31 address
        if (readRawI2C(gpio, device_addr, 0x00, buffer, 6)) {
            raw_value = (uint32_t)(buffer[0] << 8 | buffer[1]);
        } else {
            reading_out.valid = false;
            reading_out.error_message = "I2C read failed";
            return false;
        }
    } else {
        // Unknown sensor type - try analog
        raw_value = readRawAnalog(gpio);
    }
    
    // Send raw data to Pi for processing
    RawSensorData raw_data;
    raw_data.gpio = gpio;
    raw_data.sensor_type = config->sensor_type;
    raw_data.raw_value = raw_value;
    raw_data.timestamp = millis();
    raw_data.metadata = "{}";
    
    ProcessedSensorData processed;
    bool success = pi_processor_->sendRawData(raw_data, processed);
    
    // Fill reading output
    reading_out.gpio = gpio;
    reading_out.sensor_type = config->sensor_type;
    reading_out.raw_value = raw_value;
    reading_out.processed_value = processed.value;
    reading_out.unit = processed.unit;
    reading_out.quality = processed.quality;
    reading_out.timestamp = millis();
    reading_out.valid = processed.valid;
    reading_out.error_message = processed.error_message;
    
    // Update config
    config->last_raw_value = raw_value;
    config->last_reading = millis();
    
    return success;
}

// Server-Centric Deviation (Autonomous Measurement Pattern):
// ESP32 misst periodisch autonom (standard in Industrial IoT wie AWS Greengrass, Azure IoT Edge).
// Begründung: Minimiert MQTT-Traffic, Server-Control via measurement_interval Config.
// Dokumentiert in: docs/ZZZ.md - "Server-Centric Pragmatic Deviations"
void SensorManager::performAllMeasurements() {
    if (!initialized_) {
        return;
    }
    
    unsigned long now = millis();
    if (now - last_measurement_time_ < measurement_interval_) {
        return;  // Not time yet
    }
    
    // Measure all active sensors
    for (uint8_t i = 0; i < sensor_count_; i++) {
        if (!sensors_[i].active) {
            continue;
        }
        
        SensorReading reading;
        if (performMeasurement(sensors_[i].gpio, reading)) {
            // Publish via MQTT
            publishSensorReading(reading);
        }
    }
    
    last_measurement_time_ = now;
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
        return false;
    }
    
    // Use OneWire bus manager
    return onewire_bus_->readRawTemperature(rom, raw_value);
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
        LOG_WARNING("Sensor Manager: MQTT not connected, skipping publish");
        return;
    }
    
    // Build topic
    const char* topic = TopicBuilder::buildSensorDataTopic(reading.gpio);
    
    // Build payload
    String payload = buildMQTTPayload(reading);
    
    // Publish
    if (!mqtt_client_->publish(topic, payload, 1)) {
        LOG_ERROR("Sensor Manager: Failed to publish sensor data for GPIO " + String(reading.gpio));
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
    
    // Build JSON payload with zone information
    payload = "{";
    payload += "\"esp_id\":\"";
    payload += esp_id;
    payload += "\",";
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
    payload += "\"raw_value\":";
    payload += String(reading.raw_value);
    payload += ",";
    payload += "\"processed_value\":";
    payload += String(reading.processed_value);
    payload += ",";
    payload += "\"unit\":\"";
    payload += reading.unit;
    payload += "\",";
    payload += "\"quality\":\"";
    payload += reading.quality;
    payload += "\",";
    payload += "\"timestamp\":";
    payload += String(reading.timestamp);
    payload += "}";
    
    return payload;
}
