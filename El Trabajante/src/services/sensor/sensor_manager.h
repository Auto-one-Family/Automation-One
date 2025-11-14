#ifndef SERVICES_SENSOR_SENSOR_MANAGER_H
#define SERVICES_SENSOR_SENSOR_MANAGER_H

#include <Arduino.h>

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

// Forward declarations
struct SensorConfig;

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
    // STATUS QUERIES
    // ============================================
    bool isInitialized() const { return initialized_; }

private:
    // ============================================
    // PRIVATE CONSTRUCTOR (SINGLETON)
    // ============================================
    SensorManager() : initialized_(false) {}
    ~SensorManager() {}

    // ============================================
    // INTERNAL STATE
    // ============================================
    bool initialized_;
};

// ============================================
// GLOBAL INSTANCE ACCESS
// ============================================
extern SensorManager& sensorManager;

#endif // SERVICES_SENSOR_SENSOR_MANAGER_H
