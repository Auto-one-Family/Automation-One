#include "i2c_bus.h"
#include <cstring>
#include "../utils/logger.h"
#include "../drivers/gpio_manager.h"
#include "../error_handling/error_tracker.h"
#include "../models/error_codes.h"

// ============================================
// I2C BUS RECOVERY CONFIGURATION
// ============================================
// Maximum recovery attempts within cooldown period
constexpr uint8_t I2C_MAX_RECOVERY_ATTEMPTS = 3;
// Reset recovery counter after this time (ms)
constexpr unsigned long I2C_RECOVERY_COOLDOWN_MS = 60000;  // 1 minute

// Recovery state tracking (persistent across calls)
static uint8_t i2c_recovery_attempt_count = 0;
static unsigned long i2c_last_recovery_time = 0;

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

    // Handle bus errors with recovery
    if (error == 4 || error == 5) {
        LOG_WARNING("I2C bus error detected (code " + String(error) +
                    ") while addressing device 0x" + String(device_address, HEX));

        // Attempt recovery
        if (attemptRecoveryIfNeeded(error)) {
            // Recovery successful - retry the read ONCE
            LOG_INFO("I2C: Retrying read after recovery...");

            Wire.beginTransmission(device_address);
            Wire.write(register_address);
            error = Wire.endTransmission(false);

            if (error == 0) {
                LOG_INFO("I2C: Retry successful after recovery");
                // Fall through to read data
            } else {
                LOG_ERROR("I2C: Retry failed after recovery (error " + String(error) + ")");
                errorTracker.trackError(ERROR_I2C_BUS_ERROR, ERROR_SEVERITY_CRITICAL,
                                       ("I2C retry failed: device 0x" + String(device_address, HEX)).c_str());
                return false;
            }
        } else {
            LOG_ERROR("I2C: Recovery not possible or failed");
            errorTracker.trackError(ERROR_I2C_BUS_ERROR, ERROR_SEVERITY_CRITICAL,
                                   ("I2C bus error: device 0x" + String(device_address, HEX)).c_str());
            return false;
        }
    } else if (error != 0) {
        // Other errors (NACK, etc.) - not a bus issue
        LOG_ERROR("I2C write register failed: device 0x" + String(device_address, HEX) +
                  ", error " + String(error));
        errorTracker.trackError(ERROR_I2C_DEVICE_NOT_FOUND, ERROR_SEVERITY_WARNING,
                               ("Device 0x" + String(device_address, HEX) + " not responding").c_str());
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
// I2C BUS RECOVERY
// ============================================
bool I2CBusManager::recoverBus() {
    LOG_WARNING("I2C: Bus recovery initiated (attempt " +
                String(i2c_recovery_attempt_count + 1) + "/" +
                String(I2C_MAX_RECOVERY_ATTEMPTS) + ")");

    errorTracker.trackError(
        ERROR_I2C_BUS_RECOVERY_STARTED,
        ERROR_SEVERITY_WARNING,
        "I2C bus recovery initiated"
    );

    // Step 1: End current I2C session
    Wire.end();
    delay(10);

    // Step 2: Manual clock pulse to release stuck slaves
    // If a slave is holding SDA low, clocking SCL can release it
    // This is the standard I2C bus recovery procedure (9 clock pulses)
    pinMode(scl_pin_, OUTPUT);
    pinMode(sda_pin_, INPUT_PULLUP);  // Let SDA float with pull-up

    for (int i = 0; i < 9; i++) {
        digitalWrite(scl_pin_, LOW);
        delayMicroseconds(5);
        digitalWrite(scl_pin_, HIGH);
        delayMicroseconds(5);

        // Check if SDA is released
        if (digitalRead(sda_pin_) == HIGH) {
            LOG_DEBUG("I2C: SDA released after " + String(i + 1) + " clock pulses");
            break;
        }
    }

    // Step 3: Generate STOP condition to reset all slaves
    // STOP = SDA rising while SCL is high
    pinMode(sda_pin_, OUTPUT);
    digitalWrite(sda_pin_, LOW);
    delayMicroseconds(5);
    digitalWrite(scl_pin_, HIGH);
    delayMicroseconds(5);
    digitalWrite(sda_pin_, HIGH);  // SDA high while SCL high = STOP
    delayMicroseconds(10);

    // Step 4: Re-initialize I2C
    if (!Wire.begin(sda_pin_, scl_pin_, frequency_)) {
        LOG_ERROR("I2C: Bus recovery failed - could not reinitialize");
        errorTracker.trackError(
            ERROR_I2C_BUS_RECOVERY_FAILED,
            ERROR_SEVERITY_ERROR,
            "I2C bus recovery failed: Wire.begin() returned false"
        );
        return false;
    }

    // Step 5: Verify bus is functional
    Wire.beginTransmission(0x00);  // General call address
    uint8_t error = Wire.endTransmission();

    // Error 2 (NACK) is expected, Error 4 means bus still broken
    if (error == 4) {
        LOG_ERROR("I2C: Bus still stuck after recovery attempt");
        errorTracker.trackError(
            ERROR_I2C_BUS_RECOVERY_FAILED,
            ERROR_SEVERITY_ERROR,
            "I2C bus still stuck after recovery"
        );
        return false;
    }

    LOG_INFO("I2C: Bus recovery successful");
    errorTracker.trackError(
        ERROR_I2C_BUS_RECOVERED,
        ERROR_SEVERITY_WARNING,  // Warning level for visibility in logs
        "I2C bus recovered successfully"
    );

    return true;
}

bool I2CBusManager::attemptRecoveryIfNeeded(uint8_t error_code) {
    // Only attempt recovery for bus errors (4) and timeouts (5)
    if (error_code != 4 && error_code != 5) {
        return false;  // Not a recoverable error
    }

    LOG_WARNING("I2C: Bus error detected (code " + String(error_code) + "), checking recovery eligibility");

    // Check cooldown period - reset counter after 1 minute of no errors
    unsigned long now = millis();
    if (now - i2c_last_recovery_time > I2C_RECOVERY_COOLDOWN_MS) {
        i2c_recovery_attempt_count = 0;  // Reset counter
        LOG_DEBUG("I2C: Recovery counter reset (cooldown expired)");
    }

    // Check if we've exceeded max attempts
    if (i2c_recovery_attempt_count >= I2C_MAX_RECOVERY_ATTEMPTS) {
        LOG_ERROR("I2C: Max recovery attempts (" + String(I2C_MAX_RECOVERY_ATTEMPTS) +
                  ") reached - bus disabled until cooldown");
        errorTracker.trackError(
            ERROR_I2C_BUS_ERROR,
            ERROR_SEVERITY_CRITICAL,
            "I2C bus permanently failed after max recovery attempts"
        );
        return false;
    }

    // Attempt recovery
    i2c_recovery_attempt_count++;
    i2c_last_recovery_time = now;

    return recoverBus();
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
    status += ",RecoveryAttempts:" + String(i2c_recovery_attempt_count);
    status += "]";
    return status;
}

