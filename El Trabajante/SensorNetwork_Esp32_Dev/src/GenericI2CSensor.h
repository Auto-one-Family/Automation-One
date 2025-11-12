#ifndef GENERIC_I2C_SENSOR_H
#define GENERIC_I2C_SENSOR_H

#include <Arduino.h>
#include <Wire.h>
#include <ArduinoJson.h>
#include <PubSubClient.h>

// =============================================================================
// GENERIC I2C SENSOR CONFIGURATION
// =============================================================================

struct I2CSensorConfig {
    uint8_t gpio;                    // GPIO pin (typically 21 for SDA, 22 for SCL)
    uint8_t i2c_address;             // I2C address (e.g., 0x44 for SHT31)
    String sensor_hint;              // Optional sensor hint (e.g., "SHT31", "BME280")
    String subzone_id;               // Subzone identifier
    String sensor_name;              // Sensor name for identification
    bool active;                     // Whether sensor is active
    unsigned long last_reading;      // Last reading timestamp
};

// =============================================================================
// GENERIC I2C SENSOR CLASS
// =============================================================================

class GenericI2CSensor {
private:
    static bool i2c_initialized;
    static I2CSensorConfig* sensor_configs;
    static uint8_t active_sensor_count;
    static const uint8_t MAX_I2C_SENSORS = 8;
    
    // MQTT and system references
    static PubSubClient* mqtt_client;
    static String esp_id;
    static String kaiser_id;
    
public:
    // Initialization
    static bool initialize(PubSubClient* mqtt_ptr, const String& esp_identifier, const String& kaiser_identifier);
    static bool initializeI2C();
    
    // Sensor Management
    static bool configureSensor(uint8_t gpio, uint8_t i2c_address, const String& sensor_hint, 
                               const String& subzone_id, const String& sensor_name);
    static bool removeSensor(uint8_t gpio);
    static bool hasSensorOnGPIO(uint8_t gpio);
    static I2CSensorConfig* getSensorConfig(uint8_t gpio);
    
    // Data Reading and Publishing
    static void performMeasurements();
    static bool sendGenericI2CSensorData(uint8_t gpio, uint8_t i2c_address, const char* sensor_hint = nullptr);
    static bool readI2CRawData(uint8_t i2c_address, uint8_t* raw_data, uint8_t data_length = 6);
    
    // Utility Functions
    static String formatI2CAddress(uint8_t address);
    static bool isValidI2CAddress(uint8_t address);
    static void printSensorStatus();
    
    // Cleanup
    static void cleanup();
};

#endif // GENERIC_I2C_SENSOR_H 