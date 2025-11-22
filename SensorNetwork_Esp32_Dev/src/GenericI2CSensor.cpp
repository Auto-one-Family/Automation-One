#include "GenericI2CSensor.h"

// Hardware-spezifische Konfiguration
#ifdef ESP32_DEV_MODE
    #include "esp32_dev_config.h"
#else
    #include "xiao_config.h"
#endif

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

// Note: buildTopic function is defined in main.cpp and declared in xiao_config.h
// This ensures consistency across the entire codebase

// =============================================================================
// STATIC MEMBER INITIALIZATION
// =============================================================================

bool GenericI2CSensor::i2c_initialized = false;
I2CSensorConfig* GenericI2CSensor::sensor_configs = nullptr;
uint8_t GenericI2CSensor::active_sensor_count = 0;
PubSubClient* GenericI2CSensor::mqtt_client = nullptr;
String GenericI2CSensor::esp_id = "";
String GenericI2CSensor::kaiser_id = "";

// =============================================================================
// INITIALIZATION METHODS
// =============================================================================

bool GenericI2CSensor::initialize(PubSubClient* mqtt_ptr, const String& esp_identifier, const String& kaiser_identifier) {
    Serial.println("[GenericI2C] Initializing Generic I2C Sensor System");
    
    // Store references
    mqtt_client = mqtt_ptr;
    esp_id = esp_identifier;
    kaiser_id = kaiser_identifier;
    
    // Initialize I2C
    if (!initializeI2C()) {
        Serial.println("[GenericI2C] ERROR: Failed to initialize I2C");
        return false;
    }
    
    // Allocate sensor configuration array
    sensor_configs = new I2CSensorConfig[MAX_I2C_SENSORS];
    if (!sensor_configs) {
        Serial.println("[GenericI2C] ERROR: Failed to allocate sensor config array");
        return false;
    }
    
    // Initialize sensor configs
    for (int i = 0; i < MAX_I2C_SENSORS; i++) {
        sensor_configs[i].active = false;
        sensor_configs[i].gpio = 0;
        sensor_configs[i].i2c_address = 0;
        sensor_configs[i].last_reading = 0;
    }
    
    active_sensor_count = 0;
    
    Serial.printf("[GenericI2C] System initialized successfully (ESP: %s, Kaiser: %s)\n", 
                 esp_id.c_str(), kaiser_id.c_str());
    return true;
}

bool GenericI2CSensor::initializeI2C() {
    if (i2c_initialized) {
        Serial.println("[GenericI2C] I2C already initialized");
        return true;
    }
    
    // Initialize I2C with hardware-specific pins
    #ifdef ESP32_DEV_MODE
        Wire.begin(ESP32_DEV_I2C_SDA, ESP32_DEV_I2C_SCL);
        Serial.printf("[GenericI2C] I2C initialized on pins %d (SDA), %d (SCL)\n", ESP32_DEV_I2C_SDA, ESP32_DEV_I2C_SCL);
    #else
        Wire.begin(XIAO_I2C_SDA, XIAO_I2C_SCL);
        Serial.printf("[GenericI2C] I2C initialized on pins %d (SDA), %d (SCL)\n", XIAO_I2C_SDA, XIAO_I2C_SCL);
    #endif
    Wire.setClock(100000); // 100kHz for compatibility
    
    // Test I2C bus
    Wire.beginTransmission(0x00); // Test with address 0x00
    byte error = Wire.endTransmission();
    
    if (error == 0) {
        Serial.println("[GenericI2C] I2C bus test successful");
    } else {
        Serial.printf("[GenericI2C] I2C bus test failed with error: %d\n", error);
        // Don't fail initialization - some sensors might not respond to address 0x00
    }
    
    i2c_initialized = true;
    Serial.println("[GenericI2C] I2C initialization completed");
    return true;
}

// =============================================================================
// SENSOR MANAGEMENT METHODS
// =============================================================================

bool GenericI2CSensor::configureSensor(uint8_t gpio, uint8_t i2c_address, const String& sensor_hint, 
                                       const String& subzone_id, const String& sensor_name) {
    if (!i2c_initialized || !sensor_configs) {
        Serial.println("[GenericI2C] ERROR: System not initialized");
        return false;
    }
    
    if (active_sensor_count >= MAX_I2C_SENSORS) {
        Serial.printf("[GenericI2C] ERROR: Maximum sensors reached (%d/%d)\n", active_sensor_count, MAX_I2C_SENSORS);
        return false;
    }
    
    if (!isValidI2CAddress(i2c_address)) {
        Serial.printf("[GenericI2C] ERROR: Invalid I2C address 0x%02X\n", i2c_address);
        return false;
    }
    
    // Check if sensor already exists on this GPIO
    if (hasSensorOnGPIO(gpio)) {
        Serial.printf("[GenericI2C] ERROR: Sensor already configured on GPIO %d\n", gpio);
        return false;
    }
    
    // Find free slot
    int slot = -1;
    for (int i = 0; i < MAX_I2C_SENSORS; i++) {
        if (!sensor_configs[i].active) {
            slot = i;
            break;
        }
    }
    
    if (slot == -1) {
        Serial.println("[GenericI2C] ERROR: No free slots available");
        return false;
    }
    
    // Configure sensor
    I2CSensorConfig& config = sensor_configs[slot];
    config.gpio = gpio;
    config.i2c_address = i2c_address;
    config.sensor_hint = sensor_hint;
    config.subzone_id = subzone_id;
    config.sensor_name = sensor_name;
    config.active = true;
    config.last_reading = 0;
    
    active_sensor_count++;
    
    Serial.printf("[GenericI2C] Sensor configured: %s on GPIO %d, I2C 0x%02X, SubZone: %s\n", 
                 sensor_name.c_str(), gpio, i2c_address, subzone_id.c_str());
    
    // Test I2C communication
    uint8_t test_data[6];
    if (readI2CRawData(i2c_address, test_data, 6)) {
        Serial.printf("[GenericI2C] I2C communication test successful for 0x%02X\n", i2c_address);
    } else {
        Serial.printf("[GenericI2C] WARNING: I2C communication test failed for 0x%02X\n", i2c_address);
        // Don't fail configuration - sensor might need specific commands
    }
    
    return true;
}

bool GenericI2CSensor::removeSensor(uint8_t gpio) {
    if (!sensor_configs) return false;
    
    for (int i = 0; i < MAX_I2C_SENSORS; i++) {
        if (sensor_configs[i].active && sensor_configs[i].gpio == gpio) {
            Serial.printf("[GenericI2C] Removing sensor: %s on GPIO %d\n", 
                         sensor_configs[i].sensor_name.c_str(), gpio);
            
            sensor_configs[i].active = false;
            sensor_configs[i].gpio = 0;
            sensor_configs[i].i2c_address = 0;
            sensor_configs[i].sensor_hint = "";
            sensor_configs[i].subzone_id = "";
            sensor_configs[i].sensor_name = "";
            sensor_configs[i].last_reading = 0;
            
            active_sensor_count--;
            return true;
        }
    }
    
    Serial.printf("[GenericI2C] No sensor found on GPIO %d\n", gpio);
    return false;
}

bool GenericI2CSensor::hasSensorOnGPIO(uint8_t gpio) {
    if (!sensor_configs) return false;
    
    for (int i = 0; i < MAX_I2C_SENSORS; i++) {
        if (sensor_configs[i].active && sensor_configs[i].gpio == gpio) {
            return true;
        }
    }
    return false;
}

I2CSensorConfig* GenericI2CSensor::getSensorConfig(uint8_t gpio) {
    if (!sensor_configs) return nullptr;
    
    for (int i = 0; i < MAX_I2C_SENSORS; i++) {
        if (sensor_configs[i].active && sensor_configs[i].gpio == gpio) {
            return &sensor_configs[i];
        }
    }
    return nullptr;
}

// =============================================================================
// DATA READING AND PUBLISHING METHODS
// =============================================================================

void GenericI2CSensor::performMeasurements() {
    if (!i2c_initialized || !sensor_configs || active_sensor_count == 0) {
        return;
    }
    
    Serial.printf("[GenericI2C] Performing measurements for %d sensors\n", active_sensor_count);
    
    for (int i = 0; i < MAX_I2C_SENSORS; i++) {
        if (sensor_configs[i].active) {
            I2CSensorConfig& config = sensor_configs[i];
            
            // Send data for this sensor
            sendGenericI2CSensorData(config.gpio, config.i2c_address, 
                                   config.sensor_hint.length() > 0 ? config.sensor_hint.c_str() : nullptr);
            
            config.last_reading = millis();
            
            // Small delay between sensors
            delay(50);
        }
    }
}

bool GenericI2CSensor::sendGenericI2CSensorData(uint8_t gpio, uint8_t i2c_address, const char* sensor_hint) {
    if (!mqtt_client || !mqtt_client->connected()) {
        Serial.println("[GenericI2C] ERROR: MQTT not connected");
        return false;
    }
    
    // Read raw I2C data
    uint8_t raw_data[6];
    if (!readI2CRawData(i2c_address, raw_data, 6)) {
        Serial.printf("[GenericI2C] ERROR: Failed to read I2C data from 0x%02X\n", i2c_address);
        return false;
    }
    
    // Create JSON payload
    DynamicJsonDocument doc(512);
    
    doc["sensor_type"] = "SENSOR_CUSTOM_PI_ENHANCED";
    doc["i2c_address"] = formatI2CAddress(i2c_address);
    
    // Raw data object
    JsonObject raw_data_obj = doc.createNestedObject("raw_data");
    raw_data_obj["raw_1"] = raw_data[0];
    raw_data_obj["raw_2"] = raw_data[1];
    raw_data_obj["raw_3"] = raw_data[2];
    raw_data_obj["raw_4"] = raw_data[3];
    raw_data_obj["raw_5"] = raw_data[4];
    raw_data_obj["raw_6"] = raw_data[5];
    
    // Optional sensor hint
    if (sensor_hint && strlen(sensor_hint) > 0) {
        doc["sensor_hint"] = sensor_hint;
    }
    
    doc["gpio"] = gpio;
    doc["esp_id"] = esp_id;
    
    // Get subzone_id from sensor config
    I2CSensorConfig* config = getSensorConfig(gpio);
    if (config) {
        doc["subzone_id"] = config->subzone_id;
    } else {
        doc["subzone_id"] = "unknown";
    }
    
    doc["timestamp"] = millis();
    
    // Serialize JSON
    String payload;
    ArduinoJson::serializeJson(doc, payload);
    
    // Create MQTT topic using buildTopic function
    String topic = buildTopic("sensor", esp_id, String(gpio)) + "/data";
    
    // Publish to MQTT
    if (mqtt_client->publish(topic.c_str(), payload.c_str())) {
        Serial.printf("[GenericI2C] Published: GPIO %d, I2C 0x%02X, Topic: %s\n", 
                     gpio, i2c_address, topic.c_str());
        Serial.printf("[GenericI2C] Payload: %s\n", payload.c_str());
        return true;
    } else {
        Serial.printf("[GenericI2C] ERROR: Failed to publish to topic: %s\n", topic.c_str());
        return false;
    }
}

bool GenericI2CSensor::readI2CRawData(uint8_t i2c_address, uint8_t* raw_data, uint8_t data_length) {
    if (!i2c_initialized) {
        Serial.println("[GenericI2C] ERROR: I2C not initialized");
        return false;
    }
    
    if (!raw_data || data_length == 0) {
        Serial.println("[GenericI2C] ERROR: Invalid parameters");
        return false;
    }
    
    // Request data from I2C device
    Wire.beginTransmission(i2c_address);
    byte error = Wire.endTransmission();
    
    if (error != 0) {
        Serial.printf("[GenericI2C] ERROR: I2C transmission failed at address 0x%02X, error: %d\n", 
                     i2c_address, error);
        return false;
    }
    
    // Request data
    uint8_t bytes_received = Wire.requestFrom(i2c_address, data_length);
    
    if (bytes_received != data_length) {
        Serial.printf("[GenericI2C] ERROR: Expected %d bytes, received %d from 0x%02X\n", 
                     data_length, bytes_received, i2c_address);
        return false;
    }
    
    // Read data
    for (uint8_t i = 0; i < data_length; i++) {
        if (Wire.available()) {
            raw_data[i] = Wire.read();
        } else {
            Serial.printf("[GenericI2C] ERROR: No data available at byte %d\n", i);
            return false;
        }
    }
    
    Serial.printf("[GenericI2C] Successfully read %d bytes from I2C 0x%02X: [%02X %02X %02X %02X %02X %02X]\n", 
                 data_length, i2c_address, raw_data[0], raw_data[1], raw_data[2], 
                 raw_data[3], raw_data[4], raw_data[5]);
    
    return true;
}

// =============================================================================
// UTILITY METHODS
// =============================================================================

String GenericI2CSensor::formatI2CAddress(uint8_t address) {
    char buffer[8];
    snprintf(buffer, sizeof(buffer), "0x%02X", address);
    return String(buffer);
}

bool GenericI2CSensor::isValidI2CAddress(uint8_t address) {
    // Valid I2C addresses are 7-bit (0x08 to 0x77)
    return (address >= 0x08 && address <= 0x77);
}

void GenericI2CSensor::printSensorStatus() {
    if (!sensor_configs) {
        Serial.println("[GenericI2C] No sensor configurations available");
        return;
    }
    
    Serial.println("\n=== GENERIC I2C SENSOR STATUS ===");
    Serial.printf("Active sensors: %d/%d\n", active_sensor_count, MAX_I2C_SENSORS);
    Serial.printf("I2C initialized: %s\n", i2c_initialized ? "Yes" : "No");
    Serial.printf("MQTT connected: %s\n", (mqtt_client && mqtt_client->connected()) ? "Yes" : "No");
    
    if (active_sensor_count > 0) {
        Serial.println("\nConfigured sensors:");
        for (int i = 0; i < MAX_I2C_SENSORS; i++) {
            if (sensor_configs[i].active) {
                const I2CSensorConfig& config = sensor_configs[i];
                Serial.printf("  [%d] %s: GPIO %d, I2C 0x%02X, SubZone: %s\n", 
                             i, config.sensor_name.c_str(), config.gpio, 
                             config.i2c_address, config.subzone_id.c_str());
                if (config.sensor_hint.length() > 0) {
                    Serial.printf("       Hint: %s\n", config.sensor_hint.c_str());
                }
                Serial.printf("       Last reading: %lu ms ago\n", 
                             config.last_reading > 0 ? millis() - config.last_reading : 0);
            }
        }
    }
    
    Serial.println("================================\n");
}

// =============================================================================
// CLEANUP METHODS
// =============================================================================

void GenericI2CSensor::cleanup() {
    Serial.println("[GenericI2C] Cleaning up Generic I2C Sensor System");
    
    if (sensor_configs) {
        delete[] sensor_configs;
        sensor_configs = nullptr;
    }
    
    active_sensor_count = 0;
    i2c_initialized = false;
    mqtt_client = nullptr;
    
    Serial.println("[GenericI2C] Cleanup completed");
} 