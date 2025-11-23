#ifndef SERVICES_SENSOR_SENSOR_MANAGER_H
#define SERVICES_SENSOR_SENSOR_MANAGER_H

#include <Arduino.h>
#include "../../models/sensor_types.h"

// ============================================
// Sensor Manager - Phase 4 Foundation
// ============================================
// Phase 3: Preparatory skeleton for raw data reading
// Phase 4: Full sensor management implementation
// Architecture: Server-Centric (Pi-Enhanced Mode)
//
// Purpose: Raw sensor data acquisition for Pi-Enhanced processing
// - Coordinate I2C and OneWire sensor readings
// - Provide raw data to PiEnhancedProcessor
// - NO local sensor processing (Server-Centric!)

// ============================================
// SENSOR MANAGER CLASS
// ============================================
// Singleton class managing sensor operations

class SensorManager {
public:
    // ============================================
    // SINGLETON PATTERN
    // ============================================
    static SensorManager& getInstance() {
        static SensorManager instance;
        return instance;
    }

    // Prevent copy and move operations
    SensorManager(const SensorManager&) = delete;
    SensorManager& operator=(const SensorManager&) = delete;
    SensorManager(SensorManager&&) = delete;
    SensorManager& operator=(SensorManager&&) = delete;

    // ============================================
    // LIFECYCLE MANAGEMENT
    // ============================================
    // Initialize sensor manager
    bool begin();

    // Deinitialize sensor manager
    void end();

    // ============================================
    // RAW DATA READING (PHASE 3 PREPARATION)
    // ============================================
    // These methods will be fully implemented in Phase 4
    // Currently serve as API skeleton for Phase 3 integration
    
    // Perform I2C measurement and return raw bytes
    // Will be implemented in Phase 4 with full sensor driver support
    bool performI2CMeasurement(uint8_t device_address, uint8_t reg, 
                               uint8_t* buffer, size_t len);
    
    // Perform OneWire temperature measurement and return raw value
    // Will be implemented in Phase 4 with full sensor driver support
    bool performOneWireMeasurement(const uint8_t rom[8], int16_t& raw_value);

    // ============================================
    // SENSOR CONFIGURATION (PHASE 4)
    // ============================================
    // Configure a sensor
    bool configureSensor(const SensorConfig& config);
    
    // Remove a sensor
    bool removeSensor(uint8_t gpio);
    
    // Get sensor configuration
    SensorConfig getSensorConfig(uint8_t gpio) const;
    
    // Check if sensor exists on GPIO
    bool hasSensorOnGPIO(uint8_t gpio) const;
    
    // Get active sensor count
    uint8_t getActiveSensorCount() const;

    // ============================================
    // SENSOR READING (PHASE 4)
    // ============================================
    // Perform measurement for a specific GPIO-based sensor
    bool performMeasurement(uint8_t gpio, SensorReading& reading_out);
    
    // Perform measurements for all active sensors
    // Publishes results via MQTT automatically
    void performAllMeasurements();
    
    // ============================================
    // RAW DATA READING METHODS (PHASE 4)
    // ============================================
    // Read raw analog value
    uint32_t readRawAnalog(uint8_t gpio);
    
    // Read raw digital value
    uint32_t readRawDigital(uint8_t gpio);
    
    // Read raw I2C data
    bool readRawI2C(uint8_t gpio, uint8_t device_address, 
                    uint8_t reg, uint8_t* buffer, size_t len);
    
    // Read raw OneWire data
    bool readRawOneWire(uint8_t gpio, const uint8_t rom[8], int16_t& raw_value);
    
    // ============================================
    // STATUS QUERIES
    // ============================================
    bool isInitialized() const { return initialized_; }
    
    // Get sensor info string
    String getSensorInfo(uint8_t gpio) const;

private:
    // ============================================
    // PRIVATE CONSTRUCTOR (SINGLETON)
    // ============================================
    SensorManager();
    ~SensorManager();

    // ============================================
    // INTERNAL STATE
    // ============================================
    #ifndef MAX_SENSORS
      #define MAX_SENSORS 10  // Default fallback if not defined in platformio.ini
    #endif
    SensorConfig sensors_[MAX_SENSORS];
    uint8_t sensor_count_;
    bool initialized_;
    
    // Component references
    class PiEnhancedProcessor* pi_processor_;
    class MQTTClient* mqtt_client_;
    class I2CBusManager* i2c_bus_;
    class OneWireBusManager* onewire_bus_;
    class GPIOManager* gpio_manager_;
    
    // Measurement timing
    unsigned long last_measurement_time_;
    unsigned long measurement_interval_;  // 30s default
    
    // ============================================
    // HELPER METHODS
    // ============================================
    // Find sensor config by GPIO
    SensorConfig* findSensorConfig(uint8_t gpio);
    const SensorConfig* findSensorConfig(uint8_t gpio) const;
    
    // Publish sensor reading via MQTT
    void publishSensorReading(const SensorReading& reading);
    
    // Build MQTT payload from sensor reading
    String buildMQTTPayload(const SensorReading& reading) const;
};

// ============================================
// GLOBAL INSTANCE ACCESS
// ============================================
extern SensorManager& sensorManager;

#endif // SERVICES_SENSOR_SENSOR_MANAGER_H
