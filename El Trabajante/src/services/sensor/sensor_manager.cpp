#include "sensor_manager.h"
#include "../../utils/logger.h"
#include "../../drivers/i2c_bus.h"
#include "../../drivers/onewire_bus.h"
#include "../../error_handling/error_tracker.h"
#include "../../models/error_codes.h"

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

    LOG_INFO("Sensor Manager initialization started (Phase 3 skeleton)");
    
    // Phase 3: Basic initialization
    // Phase 4: Full sensor driver initialization
    
    initialized_ = true;
    
    LOG_INFO("Sensor Manager initialized (Phase 3 skeleton)");
    LOG_INFO("  Note: Full sensor support in Phase 4");
    
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
    
    LOG_INFO("Sensor Manager shutdown");
    
    initialized_ = false;
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
