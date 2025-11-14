#include "i2c_bus.h"
#include <cstring>
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
I2CBusManager& i2cBusManager = I2CBusManager::getInstance();

// ============================================
// LIFECYCLE: INITIALIZATION
// ============================================
bool I2CBusManager::begin() {
    // Prevent double initialization
    if (initialized_) {
        LOG_WARNING("I2C bus already initialized");
        return true;
    }

    LOG_INFO("I2C Bus Manager initialization started");
    
    // Load hardware-specific configuration
    sda_pin_ = HardwareConfig::I2C_SDA_PIN;
    scl_pin_ = HardwareConfig::I2C_SCL_PIN;
    frequency_ = HardwareConfig::I2C_FREQUENCY;
    
    LOG_DEBUG("I2C Config: SDA=" + String(sda_pin_) + 
              ", SCL=" + String(scl_pin_) + 
              ", Freq=" + String(frequency_) + "Hz");
    
    auto ensure_system_reservation = [&](uint8_t pin, const char* component_label) -> bool {
        GPIOPinInfo info = gpioManager.getPinInfo(pin);
        if (info.pin == 255) {
            String msg = "GPIO " + String(pin) + " not tracked by GPIOManager";
            LOG_ERROR("I2C pin verification failed: " + msg);
            errorTracker.trackError(ERROR_I2C_INIT_FAILED,
                                    ERROR_SEVERITY_CRITICAL,
                                    msg.c_str());
            return false;
        }

        bool owned_by_system = (strncmp(info.owner, "system", sizeof(info.owner)) == 0) &&
                               (strncmp(info.component_name, component_label,
                                        sizeof(info.component_name)) == 0);

        if (!owned_by_system) {
            if (info.owner[0] == '\0') {
                if (!gpioManager.requestPin(pin, "system", component_label)) {
                    String msg = "GPIO " + String(pin) + " reservation failed";
                    LOG_ERROR("I2C pin reservation failed: " + msg);
                    errorTracker.trackError(ERROR_I2C_INIT_FAILED,
                                            ERROR_SEVERITY_CRITICAL,
                                            msg.c_str());
                    return false;
                }
            } else {
                String msg = "GPIO " + String(pin) + " owned by " +
                             String(info.owner) + "/" + String(info.component_name);
                LOG_ERROR("I2C pin conflict: " + msg);
                errorTracker.trackError(ERROR_I2C_INIT_FAILED,
                                        ERROR_SEVERITY_CRITICAL,
                                        msg.c_str());
                return false;
            }
        }
        return true;
    };

    if (!ensure_system_reservation(sda_pin_, "I2C_SDA") ||
        !ensure_system_reservation(scl_pin_, "I2C_SCL")) {
        return false;
    }
    
    // Initialize I2C hardware
    bool wire_init = Wire.begin(sda_pin_, scl_pin_, frequency_);
    
    if (!wire_init) {
        LOG_ERROR("I2C Wire.begin() failed");
        errorTracker.trackError(ERROR_I2C_INIT_FAILED, 
                               ERROR_SEVERITY_CRITICAL,
                               "Wire.begin() returned false");
        return false;
    }
    
    // Verify I2C bus is functional by attempting a quick scan
    Wire.beginTransmission(0x00);  // General call address
    uint8_t error = Wire.endTransmission();
    
    // Error code 2 is expected (NACK on general call) - bus is functional
    // Error code 4 would indicate bus failure
    if (error == 4) {
        LOG_ERROR("I2C bus error: Bus not functional");
        errorTracker.trackError(ERROR_I2C_BUS_ERROR, 
                               ERROR_SEVERITY_CRITICAL,
                               "I2C bus verification failed");
        Wire.end();
        return false;
    }
    
    initialized_ = true;
    
    LOG_INFO("I2C Bus Manager initialized successfully");
    LOG_INFO("  Board: " + String(BOARD_TYPE));
    LOG_INFO("  SDA: GPIO " + String(sda_pin_));
    LOG_INFO("  SCL: GPIO " + String(scl_pin_));
    LOG_INFO("  Frequency: " + String(frequency_ / 1000) + " kHz");
    
    return true;
}

// ============================================
// LIFECYCLE: DEINITIALIZATION
// ============================================
void I2CBusManager::end() {
    if (!initialized_) {
        LOG_WARNING("I2C bus not initialized, nothing to end");
        return;
    }
    
    LOG_INFO("I2C Bus Manager shutdown initiated");
    
    // Deinitialize Wire library
    Wire.end();
    
    // Release GPIO pins (return to safe mode)
    gpioManager.releasePin(sda_pin_);
    gpioManager.releasePin(scl_pin_);
    
    initialized_ = false;
    
    LOG_INFO("I2C Bus Manager shutdown complete");
}

// ============================================
// BUS SCANNING
// ============================================
bool I2CBusManager::scanBus(uint8_t addresses[], uint8_t max_addresses, uint8_t& found_count) {
    if (!initialized_) {
        LOG_ERROR("I2C bus not initialized");
        return false;
    }

    if (addresses == nullptr) {
        LOG_ERROR("I2C bus scan requires a valid address buffer");
        return false;
    }

    if (max_addresses == 0) {
        LOG_ERROR("I2C bus scan called with max_addresses = 0");
        return false;
    }

    LOG_INFO("I2C bus scan started (0x08-0x77)");
    
    found_count = 0;
    uint8_t detected = 0;
    
    // Scan I2C address range (0x08-0x77)
    // Addresses 0x00-0x07 and 0x78-0x7F are reserved
    for (uint8_t addr = 0x08; addr <= 0x77; addr++) {
        Wire.beginTransmission(addr);
        uint8_t error = Wire.endTransmission();
        
        if (error == 0) {
            // Device found
            detected++;
            if (found_count < max_addresses) {
                addresses[found_count++] = addr;
                LOG_INFO("  Found device at 0x" + String(addr, HEX));
            } else {
                LOG_WARNING("  Device at 0x" + String(addr, HEX) + " ignored (buffer full)");
            }
        } else if (error == 4 || error == 5) {
            LOG_WARNING("  Bus error while probing 0x" + String(addr, HEX) + " (code " + String(error) + ")");
        }
        
        delay(1);  // Small delay between scans
    }
    
    if (detected > found_count) {
        LOG_WARNING("I2C bus scan truncated results (" + String(detected) + " detected, " +
                    String(found_count) + " stored)");
    } else {
        LOG_INFO("I2C bus scan complete: " + String(found_count) + " devices found");
    }
    
    return true;
}

// ============================================
// DEVICE PRESENCE CHECK
// ============================================
bool I2CBusManager::isDevicePresent(uint8_t address) {
    if (!initialized_) {
        LOG_ERROR("I2C bus not initialized");
        return false;
    }
    
    if (address < 0x08 || address > 0x77) {
        LOG_ERROR("Invalid I2C address: 0x" + String(address, HEX));
        return false;
    }
    
    Wire.beginTransmission(address);
    uint8_t error = Wire.endTransmission();
    
    return (error == 0);
}

// ============================================
// RAW DATA READING
// ============================================
bool I2CBusManager::readRaw(uint8_t device_address, uint8_t register_address,
                            uint8_t* buffer, size_t length) {
    if (!initialized_) {
        LOG_ERROR("I2C bus not initialized");
        errorTracker.trackError(ERROR_I2C_READ_FAILED, 
                               ERROR_SEVERITY_ERROR,
                               "Read failed: bus not initialized");
        return false;
    }
    
    if (buffer == nullptr || length == 0) {
        LOG_ERROR("I2C read: Invalid buffer or length");
        return false;
    }

    if (device_address < 0x08 || device_address > 0x77) {
        LOG_ERROR("I2C read: Invalid address 0x" + String(device_address, HEX));
        return false;
    }
    
    // Write register address
    Wire.beginTransmission(device_address);
    Wire.write(register_address);
    uint8_t error = Wire.endTransmission(false);  // false = repeated start
    
    if (error != 0) {
        LOG_ERROR("I2C write register failed: device 0x" + String(device_address, HEX) + 
                  ", error " + String(error));
        uint16_t code = (error == 4 || error == 5) ? ERROR_I2C_BUS_ERROR : ERROR_I2C_DEVICE_NOT_FOUND;
        String msg = "Device 0x" + String(device_address, HEX) + " register write error (" + String(error) + ")";
        errorTracker.trackError(code,
                               (code == ERROR_I2C_BUS_ERROR) ? ERROR_SEVERITY_CRITICAL : ERROR_SEVERITY_WARNING,
                               msg.c_str());
        return false;
    }
    
    // Read data
    size_t received = Wire.requestFrom(device_address, (uint8_t)length);
    
    if (received != length) {
        LOG_ERROR("I2C read: Expected " + String(length) + " bytes, got " + String(received));
        String msg = "Incomplete read from 0x" + String(device_address, HEX);
        errorTracker.trackError(ERROR_I2C_READ_FAILED,
                               ERROR_SEVERITY_ERROR,
                               msg.c_str());
        return false;
    }
    
    // Copy data to buffer
    for (size_t i = 0; i < length; i++) {
        buffer[i] = Wire.read();
    }
    
    LOG_DEBUG("I2C read: " + String(length) + " bytes from 0x" + 
              String(device_address, HEX) + " reg 0x" + String(register_address, HEX));
    
    return true;
}

// ============================================
// RAW DATA WRITING
// ============================================
bool I2CBusManager::writeRaw(uint8_t device_address, uint8_t register_address,
                             const uint8_t* data, size_t length) {
    if (!initialized_) {
        LOG_ERROR("I2C bus not initialized");
        errorTracker.trackError(ERROR_I2C_WRITE_FAILED,
                               ERROR_SEVERITY_ERROR,
                               "Write failed: bus not initialized");
        return false;
    }
    
    if (data == nullptr || length == 0) {
        LOG_ERROR("I2C write: Invalid data or length");
        return false;
    }

    if (device_address < 0x08 || device_address > 0x77) {
        LOG_ERROR("I2C write: Invalid address 0x" + String(device_address, HEX));
        return false;
    }
    
    // Begin transmission
    Wire.beginTransmission(device_address);
    
    // Write register address
    Wire.write(register_address);
    
    // Write data bytes
    size_t written = Wire.write(data, length);
    
    if (written != length) {
        LOG_ERROR("I2C write: Expected to write " + String(length) + " bytes, wrote " + String(written));
        String msg = "Incomplete write to 0x" + String(device_address, HEX);
        errorTracker.trackError(ERROR_I2C_WRITE_FAILED,
                               ERROR_SEVERITY_ERROR,
                               msg.c_str());
        Wire.endTransmission();
        return false;
    }
    
    // End transmission
    uint8_t error = Wire.endTransmission();
    
    if (error != 0) {
        LOG_ERROR("I2C write failed: device 0x" + String(device_address, HEX) + 
                  ", error " + String(error));
        uint16_t code = (error == 2 || error == 3) ? ERROR_I2C_DEVICE_NOT_FOUND :
                         (error == 4 || error == 5) ? ERROR_I2C_BUS_ERROR : ERROR_I2C_WRITE_FAILED;
        String msg = "Write error " + String(error) + " to 0x" + String(device_address, HEX);
        errorTracker.trackError(code,
                               (code == ERROR_I2C_BUS_ERROR) ? ERROR_SEVERITY_CRITICAL : ERROR_SEVERITY_ERROR,
                               msg.c_str());
        return false;
    }
    
    LOG_DEBUG("I2C write: " + String(length) + " bytes to 0x" + 
              String(device_address, HEX) + " reg 0x" + String(register_address, HEX));
    
    return true;
}

// ============================================
// STATUS QUERIES
// ============================================
String I2CBusManager::getBusStatus() const {
    String status = "I2C[";
    status += "SDA:" + String(sda_pin_);
    status += ",SCL:" + String(scl_pin_);
    status += ",Freq:" + String(frequency_ / 1000) + "kHz";
    status += ",Init:" + String(initialized_ ? "true" : "false");
    status += "]";
    return status;
}

