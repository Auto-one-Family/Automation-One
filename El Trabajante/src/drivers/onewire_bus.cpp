#include "onewire_bus.h"
#include "../utils/logger.h"
#include "../drivers/gpio_manager.h"
#include "../error_handling/error_tracker.h"
#include "../models/error_codes.h"

// ============================================
// CONDITIONAL HARDWARE CONFIGURATION INCLUDES
// ============================================
#ifdef XIAO_ESP32C3
    #include "../config/hardware/xiao_esp32c3.h"
#else
    #include "../config/hardware/esp32_dev.h"
#endif

// ============================================
// GLOBAL INSTANCE
// ============================================
OneWireBusManager& oneWireBusManager = OneWireBusManager::getInstance();

// ============================================
// LIFECYCLE: INITIALIZATION
// ============================================
bool OneWireBusManager::begin(uint8_t pin) {
    // ============================================
    // PIN SELECTION: Override oder Default (BEFORE init check!)
    // ============================================
    uint8_t requested_pin;
    if (pin != 0 && pin <= 39) {  // ESP32 hat GPIO 0-39
        requested_pin = pin;
    } else {
        requested_pin = HardwareConfig::DEFAULT_ONEWIRE_PIN;
    }

    // ============================================
    // DOUBLE-INIT CHECK: Same pin OK, different pin ERROR
    // ============================================
    if (initialized_) {
        // Same pin → OK, bus already active
        if (requested_pin == pin_) {
            LOG_DEBUG("OneWire: Already initialized on GPIO " + String(pin_) + ", reusing bus");
            return true;
        }
        
        // Different pin → ERROR (Single-Bus-Design!)
        // Cannot switch OneWire bus to different pin without calling end() first
        LOG_ERROR("OneWire: Bus active on GPIO " + String(pin_) + 
                 ", cannot switch to GPIO " + String(requested_pin) + 
                 " (Single-Bus-Design - call end() first if pin change needed)");
        errorTracker.trackError(ERROR_ONEWIRE_INIT_FAILED,
                               ERROR_SEVERITY_ERROR,
                               ("Pin conflict: active=" + String(pin_) + ", requested=" + String(requested_pin)).c_str());
        return false;
    }

    LOG_INFO("OneWire Bus Manager initialization started");

    // ============================================
    // PIN ASSIGNMENT
    // ============================================
    pin_ = requested_pin;
    if (pin != 0 && pin <= 39) {
        LOG_INFO("OneWireBus: Using configured pin GPIO " + String(pin_));
    } else {
        LOG_INFO("OneWireBus: Using hardware default pin GPIO " + String(pin_));
        #ifdef WOKWI_SIMULATION
            LOG_DEBUG("  (Wokwi mode - using diagram.json pin configuration)");
        #endif
    }

    LOG_DEBUG("OneWire Config: Pin=" + String(pin_));

    // ============================================
    // GPIO SAFETY VALIDATION
    // ============================================
    if (!gpioManager.requestPin(pin_, "sensor", "OneWireBus")) {
        LOG_ERROR("Failed to reserve OneWire pin " + String(pin_));
        errorTracker.trackError(ERROR_ONEWIRE_INIT_FAILED,
                               ERROR_SEVERITY_CRITICAL,
                               ("Pin reservation failed: GPIO " + String(pin_)).c_str());
        return false;
    }
    
    // Initialize OneWire library
    onewire_ = new OneWire(pin_);
    
    if (onewire_ == nullptr) {
        LOG_ERROR("OneWire object allocation failed");
        errorTracker.trackError(ERROR_ONEWIRE_INIT_FAILED,
                               ERROR_SEVERITY_CRITICAL,
                               "Memory allocation failed");
        gpioManager.releasePin(pin_);
        return false;
    }
    
    // Verify bus is functional by attempting a reset
    if (!onewire_->reset()) {
        LOG_WARNING("OneWire bus reset failed - no devices present or bus error");
        // This is not necessarily an error - just means no devices connected yet
    }
    
    initialized_ = true;
    
    LOG_INFO("OneWire Bus Manager initialized successfully");
    LOG_INFO("  Board: " + String(BOARD_TYPE));
    LOG_INFO("  Pin: GPIO " + String(pin_));
    
    return true;
}

// ============================================
// LIFECYCLE: DEINITIALIZATION
// ============================================
void OneWireBusManager::end() {
    if (!initialized_) {
        LOG_WARNING("OneWire bus not initialized, nothing to end");
        return;
    }
    
    LOG_INFO("OneWire Bus Manager shutdown initiated");
    
    // Delete OneWire object
    if (onewire_ != nullptr) {
        delete onewire_;
        onewire_ = nullptr;
    }
    
    // Release GPIO pin (return to safe mode)
    gpioManager.releasePin(pin_);
    
    initialized_ = false;
    
    LOG_INFO("OneWire Bus Manager shutdown complete");
}

// ============================================
// DEVICE DISCOVERY
// ============================================
bool OneWireBusManager::scanDevices(uint8_t rom_codes[][8], uint8_t max_devices, uint8_t& found_count) {
    if (!initialized_ || onewire_ == nullptr) {
        LOG_ERROR("OneWire bus not initialized");
        return false;
    }
    
    LOG_INFO("OneWire bus scan started");
    
    found_count = 0;
    
    // Reset search
    onewire_->reset_search();
    
    // Search for devices
    uint8_t rom[8];
    while (onewire_->search(rom)) {
        // Check CRC
        if (OneWire::crc8(rom, 7) != rom[7]) {
            LOG_WARNING("OneWire CRC error - device ignored");
            continue;
        }
        
        // Store ROM code
        if (found_count < max_devices) {
            for (uint8_t i = 0; i < 8; i++) {
                rom_codes[found_count][i] = rom[i];
            }
            
            LOG_INFO("  Found device: Family=0x" + String(rom[0], HEX) + 
                     " Serial=" + String((rom[6] << 8) | rom[5], HEX));
            
            found_count++;
        } else {
            LOG_WARNING("  Device found but buffer full - increase max_devices");
        }
    }
    
    if (found_count == 0) {
        LOG_WARNING("OneWire bus scan complete: No devices found");
        errorTracker.trackError(ERROR_ONEWIRE_NO_DEVICES,
                               ERROR_SEVERITY_WARNING,
                               "No devices found on bus");
    } else {
        LOG_INFO("OneWire bus scan complete: " + String(found_count) + " devices found");
    }
    
    return true;
}

// ============================================
// DEVICE PRESENCE CHECK
// ============================================
bool OneWireBusManager::isDevicePresent(const uint8_t rom_code[8]) {
    if (!initialized_ || onewire_ == nullptr) {
        LOG_ERROR("OneWire bus not initialized");
        return false;
    }
    
    // Reset search and try to find this specific device
    onewire_->reset_search();
    
    uint8_t rom[8];
    while (onewire_->search(rom)) {
        // Compare ROM codes
        bool match = true;
        for (uint8_t i = 0; i < 8; i++) {
            if (rom[i] != rom_code[i]) {
                match = false;
                break;
            }
        }
        
        if (match) {
            return true;
        }
    }
    
    return false;
}

// ============================================
// RAW TEMPERATURE READING (PI-ENHANCED MODE)
// ============================================
bool OneWireBusManager::readRawTemperature(const uint8_t rom_code[8], int16_t& raw_value) {
    if (!initialized_ || onewire_ == nullptr) {
        LOG_ERROR("OneWire bus not initialized");
        errorTracker.trackError(ERROR_ONEWIRE_READ_FAILED,
                               ERROR_SEVERITY_ERROR,
                               "Read failed: bus not initialized");
        return false;
    }
    
    // Verify device is present
    if (!onewire_->reset()) {
        LOG_ERROR("OneWire reset failed - no devices on bus");
        errorTracker.trackError(ERROR_ONEWIRE_READ_FAILED,
                               ERROR_SEVERITY_ERROR,
                               "Bus reset failed");
        return false;
    }
    
    // Select device
    onewire_->select(rom_code);
    
    // Start temperature conversion (0x44)
    onewire_->write(0x44, 1);  // 1 = parasitic power
    
    // Wait for conversion (750ms max for 12-bit resolution)
    // For faster operation, could poll bit 0 of scratchpad
    delay(750);
    
    // Reset and select device again
    if (!onewire_->reset()) {
        LOG_ERROR("OneWire reset failed after conversion");
        errorTracker.trackError(ERROR_ONEWIRE_READ_FAILED,
                               ERROR_SEVERITY_ERROR,
                               "Bus reset failed after conversion");
        return false;
    }
    
    onewire_->select(rom_code);
    
    // Read scratchpad (0xBE)
    onewire_->write(0xBE);
    
    // Read 9 bytes (scratchpad)
    uint8_t scratchpad[9];
    for (uint8_t i = 0; i < 9; i++) {
        scratchpad[i] = onewire_->read();
    }
    
    // Verify CRC
    if (OneWire::crc8(scratchpad, 8) != scratchpad[8]) {
        LOG_ERROR("OneWire CRC error on temperature read");
        errorTracker.trackError(ERROR_ONEWIRE_READ_FAILED,
                               ERROR_SEVERITY_ERROR,
                               "CRC validation failed");
        return false;
    }
    
    // Extract raw temperature value (12-bit signed)
    // Temp is in bytes 0 (LSB) and 1 (MSB)
    raw_value = (scratchpad[1] << 8) | scratchpad[0];
    
    // Raw value is in 1/16th degree units
    // Range: -550 to +1250 (-55.0°C to +125.0°C)
    // Conversion formula (done on server): temp_celsius = raw_value * 0.0625
    
    LOG_DEBUG("OneWire raw temperature: " + String(raw_value) + 
              " (will be processed by God-Kaiser)");
    
    return true;
}

// ============================================
// STATUS QUERIES
// ============================================
String OneWireBusManager::getBusStatus() const {
    String status = "OneWire[";
    status += "Pin:" + String(pin_);
    status += ",Init:" + String(initialized_ ? "true" : "false");
    status += "]";
    return status;
}
