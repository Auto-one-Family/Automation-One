#include "gpio_manager.h"
#include "../utils/logger.h"

// ============================================
// CONDITIONAL HARDWARE CONFIGURATION INCLUDES
// ============================================
// Include board-specific configuration based on build flags

#ifdef XIAO_ESP32C3
    #include "../config/hardware/xiao_esp32c3.h"
#else
    #include "../config/hardware/esp32_dev.h"
#endif

// ============================================
// GLOBAL INSTANCE
// ============================================
GPIOManager& gpioManager = GPIOManager::getInstance();

// ============================================
// CRITICAL: SAFE-MODE INITIALIZATION
// ============================================
// Source: ZZZ.md lines 1930-1950
// THIS FUNCTION MUST BE CALLED AS THE FIRST ACTION IN setup()!
//
// Why this is critical:
// - Prevents undefined GPIO states that could damage hardware
// - Ensures no actuators are accidentally triggered on boot
// - Sets all safe pins to INPUT_PULLUP (high-impedance safe state)

void GPIOManager::initializeAllPinsToSafeMode() {
    Serial.println("\n=== GPIO SAFE-MODE INITIALIZATION ===");
    Serial.printf("Board Type: %s\n", BOARD_TYPE);
    
    // Clear any existing pin information
    pins_.clear();
    pins_.reserve(HardwareConfig::SAFE_PIN_COUNT);
    
    uint8_t warning_count = 0;  // Track failed verifications
    
    // Initialize all safe GPIO pins to INPUT_PULLUP
    for (uint8_t i = 0; i < HardwareConfig::SAFE_PIN_COUNT; i++) {
        uint8_t pin = HardwareConfig::SAFE_GPIO_PINS[i];
        
        // Set hardware pin mode to INPUT_PULLUP (safe state)
        pinMode(pin, INPUT_PULLUP);
        
        // Verify pin state
        if (!verifyPinState(pin, INPUT_PULLUP)) {
            Serial.printf("  ⚠️  WARNING: GPIO %d may not be in safe state!\n", pin);
            warning_count++;
        }
        
        // Register pin in tracking system
        GPIOPinInfo info;
        info.pin = pin;
        info.owner[0] = '\0';
        info.component_name[0] = '\0';
        info.mode = INPUT_PULLUP;
        info.in_safe_mode = true;
        pins_.push_back(info);
        
        Serial.printf("  GPIO %2d: Safe-Mode (INPUT_PULLUP)\n", pin);
    }
    
    // Auto-reserve I2C pins for system use
    bool i2c_sda = requestPin(HardwareConfig::I2C_SDA_PIN, "system", "I2C_SDA");
    bool i2c_scl = requestPin(HardwareConfig::I2C_SCL_PIN, "system", "I2C_SCL");
    
    if (i2c_sda && i2c_scl) {
        Serial.printf("✅ I2C pins auto-reserved (SDA: GPIO %d, SCL: GPIO %d)\n",
                     HardwareConfig::I2C_SDA_PIN,
                     HardwareConfig::I2C_SCL_PIN);
        LOG_INFO("GPIOManager: I2C pins (SDA/SCL) auto-reserved for system bus");
    } else {
        Serial.println("⚠️  WARNING: Could not auto-reserve I2C pins");
        LOG_WARNING("GPIOManager: I2C pin auto-reservation failed");
    }
    
    // Log initialization summary
    Serial.println();
    if (warning_count > 0) {
        Serial.printf("⚠️  %d pin(s) failed verification - check hardware!\n", warning_count);
        LOG_WARNING("GPIOManager: " + String(warning_count) + " pins failed safe-mode verification");
    } else {
        Serial.println("✅ All pins successfully set to Safe-Mode");
    }
    Serial.printf("   Board: %s\n", BOARD_TYPE);
    Serial.printf("   Available Pins: %d\n", HardwareConfig::SAFE_PIN_COUNT);
    Serial.printf("   Reserved Pins: %d\n", HardwareConfig::RESERVED_PIN_COUNT);
    Serial.println("=====================================\n");
    
    LOG_INFO("GPIOManager: Safe-Mode initialization complete");
}

// ============================================
// PIN REQUEST (WITH CONFLICT DETECTION)
// ============================================
// Source: PROJECT_ANALYSIS_REPORT.md Block 6
// Implements comprehensive validation and conflict detection

bool GPIOManager::requestPin(uint8_t gpio, const char* owner, const char* component_name) {
    // ✅ VALIDATION 1: Check if pin is reserved
    if (isReservedPin(gpio)) {
        Serial.printf("❌ ERROR: GPIO %d is reserved (Boot/UART/Flash)!\n", gpio);
        LOG_ERROR("GPIOManager: Attempted to request reserved pin " + String(gpio));
        return false;
    }
    
    // ✅ VALIDATION 2: Check if pin is already in use
    for (auto& pin_info : pins_) {
        if (pin_info.pin == gpio && pin_info.owner[0] != '\0') {
            Serial.printf("❌ ERROR: GPIO %d already used by %s (%s)!\n", 
                gpio, pin_info.owner, pin_info.component_name);
            LOG_ERROR("GPIOManager: Pin " + String(gpio) + " conflict - already owned by " + String(pin_info.owner));
            return false;
        }
    }
    
    // ✅ ALLOCATION: Reserve the pin
    for (auto& pin_info : pins_) {
        if (pin_info.pin == gpio) {
            strncpy(pin_info.owner, owner, sizeof(pin_info.owner) - 1);
            pin_info.owner[sizeof(pin_info.owner) - 1] = '\0';
            strncpy(pin_info.component_name, component_name, sizeof(pin_info.component_name) - 1);
            pin_info.component_name[sizeof(pin_info.component_name) - 1] = '\0';
            pin_info.in_safe_mode = false;
            
            Serial.printf("✅ GPIO %d reserved by %s (%s)\n", gpio, owner, component_name);
            LOG_INFO("GPIOManager: Pin " + String(gpio) + " allocated to " + String(component_name));
            return true;
        }
    }
    
    // Pin not found in safe pins array
    Serial.printf("❌ ERROR: GPIO %d not found in safe pins array!\n", gpio);
    LOG_ERROR("GPIOManager: Pin " + String(gpio) + " not in safe pins list");
    return false;
}

// ============================================
// PIN RELEASE
// ============================================
// Returns pin to safe mode (INPUT_PULLUP)

bool GPIOManager::releasePin(uint8_t gpio) {
    for (auto& pin_info : pins_) {
        if (pin_info.pin == gpio) {
            Serial.printf("ℹ️  Releasing GPIO %d (was: %s/%s)\n", 
                gpio, pin_info.owner, pin_info.component_name);
            
            // Return hardware pin to safe state
            pinMode(gpio, INPUT_PULLUP);
            
            // Verify safe mode
            if (!verifyPinState(gpio, INPUT_PULLUP)) {
                Serial.printf("⚠️  WARNING: GPIO %d safe-mode verification failed\n", gpio);
                LOG_WARNING("Pin " + String(gpio) + " may not be in safe state after release");
            }
            
            // Update tracking information
            pin_info.owner[0] = '\0';
            pin_info.component_name[0] = '\0';
            pin_info.mode = INPUT_PULLUP;
            pin_info.in_safe_mode = true;
            
            LOG_INFO("GPIOManager: Pin " + String(gpio) + " released to safe mode");
            return true;
        }
    }
    
    Serial.printf("⚠️  WARNING: GPIO %d not found for release\n", gpio);
    return false;
}

// ============================================
// EMERGENCY SAFE-MODE
// ============================================
// Source: ZZZ.md lines 1976-1994
// Used in error conditions to prevent hardware damage

void GPIOManager::enableSafeModeForAllPins() {
    Serial.println("🚨 EMERGENCY: Enabling Safe-Mode for ALL pins!");
    LOG_CRITICAL("GPIOManager: Emergency safe-mode activated");
    
    uint8_t warning_count = 0;
    uint8_t de_energized_count = 0;
    
    for (auto& pin_info : pins_) {
        // Enhanced safety - De-energize outputs BEFORE mode change
        if (pin_info.mode == OUTPUT) {
            digitalWrite(pin_info.pin, LOW);  // Turn off actuator
            de_energized_count++;
            delayMicroseconds(10);            // Allow hardware to settle
            
            Serial.printf("  GPIO %d: De-energized (was OUTPUT)\n", pin_info.pin);
            LOG_INFO("Emergency: GPIO " + String(pin_info.pin) + " de-energized before safe-mode");
        }
        
        // Now safe to change mode
        pinMode(pin_info.pin, INPUT_PULLUP);
        
        // Verify emergency safe mode
        if (!verifyPinState(pin_info.pin, INPUT_PULLUP)) {
            Serial.printf("  ⚠️  WARNING: GPIO %d emergency safe-mode failed\n", pin_info.pin);
            warning_count++;
        }
        
        // Update tracking
        pin_info.in_safe_mode = true;
        pin_info.owner[0] = '\0';
        pin_info.component_name[0] = '\0';
        pin_info.mode = INPUT_PULLUP;
    }
    
    if (de_energized_count > 0) {
        Serial.printf("✅ %d output pin(s) de-energized before safe-mode\n", de_energized_count);
        LOG_INFO("Emergency: " + String(de_energized_count) + " outputs de-energized");
    }
    
    if (warning_count > 0) {
        LOG_CRITICAL("Emergency safe-mode: " + String(warning_count) + " pins failed verification!");
    }
    
    Serial.println("✅ All pins set to Safe-Mode (INPUT_PULLUP)");
    LOG_INFO("GPIOManager: All pins returned to safe mode");
}

// ============================================
// PIN CONFIGURATION
// ============================================
// Configure pin mode with validation

bool GPIOManager::configurePinMode(uint8_t gpio, uint8_t mode) {
    // ✅ VALIDATION 1: Pin reserved?
    if (isReservedPin(gpio)) {
        Serial.printf("❌ ERROR: Cannot configure reserved GPIO %d!\n", gpio);
        LOG_ERROR("GPIOManager: Attempted to configure reserved pin " + String(gpio));
        return false;
    }
    
    // ✅ VALIDATION 2: Input-Only Pin check (ESP32 WROOM specific)
    #ifndef XIAO_ESP32C3
    if (isInputOnlyPin(gpio) && mode == OUTPUT) {
        Serial.printf("❌ ERROR: GPIO %d is Input-Only (cannot set OUTPUT)!\n", gpio);
        LOG_ERROR("GPIOManager: Attempted OUTPUT mode on input-only pin " + String(gpio));
        return false;
    }
    #endif
    
    // ✅ CONFIGURE: Set pin mode
    pinMode(gpio, mode);
    
    // Verify configuration (only for INPUT_PULLUP)
    if (mode == INPUT_PULLUP) {
        if (!verifyPinState(gpio, mode)) {
            LOG_WARNING("Pin " + String(gpio) + " configuration verification failed");
            // Don't return false - best effort
        }
    }
    
    // Update tracking information
    for (auto& pin_info : pins_) {
        if (pin_info.pin == gpio) {
            pin_info.mode = mode;
            pin_info.in_safe_mode = false;
            
            String mode_str = (mode == INPUT) ? "INPUT" : 
                             (mode == OUTPUT) ? "OUTPUT" : "INPUT_PULLUP";
            Serial.printf("✅ GPIO %d configured as %s\n", gpio, mode_str.c_str());
            LOG_DEBUG("GPIOManager: Pin " + String(gpio) + " mode set to " + mode_str);
            return true;
        }
    }
    
    return false;
}

// ============================================
// PIN QUERIES
// ============================================

bool GPIOManager::isPinAvailable(uint8_t gpio) const {
    // Reserved pins are never available
    if (isReservedPin(gpio)) {
        return false;
    }
    
    // Check if pin is in safe pins list and not allocated
    for (const auto& pin_info : pins_) {
        if (pin_info.pin == gpio && pin_info.owner[0] == '\0') {
            return true;
        }
    }
    
    return false;
}

bool GPIOManager::isPinReserved(uint8_t gpio) const {
    return isReservedPin(gpio);
}

bool GPIOManager::isPinInSafeMode(uint8_t gpio) const {
    for (const auto& pin_info : pins_) {
        if (pin_info.pin == gpio) {
            return pin_info.in_safe_mode;
        }
    }
    return false;
}

// ============================================
// INFORMATION METHODS
// ============================================

GPIOPinInfo GPIOManager::getPinInfo(uint8_t gpio) const {
    for (const auto& pin_info : pins_) {
        if (pin_info.pin == gpio) {
            return pin_info;
        }
    }
    
    // Return empty info if pin not found
    GPIOPinInfo empty;
    empty.pin = 255;  // Invalid pin marker
    empty.owner[0] = '\0';
    empty.component_name[0] = '\0';
    empty.mode = INPUT_PULLUP;
    empty.in_safe_mode = true;
    return empty;
}

void GPIOManager::printPinStatus() const {
    Serial.println("\n=== GPIO PIN STATUS ===");
    Serial.printf("Board: %s\n", BOARD_TYPE);
    Serial.printf("Total Managed Pins: %zu\n", pins_.size());
    Serial.println();
    
    for (const auto& pin_info : pins_) {
        Serial.printf("  GPIO %2d: ", pin_info.pin);
        
        if (pin_info.in_safe_mode) {
            Serial.println("SAFE-MODE (available)");
        } else if (pin_info.owner[0] == '\0') {
            Serial.println("AVAILABLE");
        } else {
            Serial.printf("USED by %s (%s)\n", 
                pin_info.owner, 
                pin_info.component_name);
        }
    }
    
    Serial.println("=======================\n");
}

uint8_t GPIOManager::getAvailablePinCount() const {
    uint8_t count = 0;
    for (const auto& pin_info : pins_) {
        if (pin_info.owner[0] == '\0') {
            count++;
        }
    }
    return count;
}

// ============================================
// I2C PIN MANAGEMENT
// ============================================

void GPIOManager::releaseI2CPins() {
    Serial.println("⚠️  Releasing I2C pins for general GPIO use");
    LOG_WARNING("GPIOManager: I2C pins released - I2C bus will not be available");
    
    releasePin(HardwareConfig::I2C_SDA_PIN);
    releasePin(HardwareConfig::I2C_SCL_PIN);
    
    Serial.printf("I2C pins released: SDA (GPIO %d), SCL (GPIO %d)\n",
                 HardwareConfig::I2C_SDA_PIN,
                 HardwareConfig::I2C_SCL_PIN);
    
    LOG_INFO("GPIOManager: I2C pins now available for general GPIO use");
}

// ============================================
// HELPER METHODS (PRIVATE)
// ============================================

bool GPIOManager::isReservedPin(uint8_t gpio) const {
    for (uint8_t i = 0; i < HardwareConfig::RESERVED_PIN_COUNT; i++) {
        if (HardwareConfig::RESERVED_GPIO_PINS[i] == gpio) {
            return true;
        }
    }
    return false;
}

bool GPIOManager::isInputOnlyPin(uint8_t gpio) const {
    #ifndef XIAO_ESP32C3
    // ESP32 WROOM has input-only pins (GPIO 34-39)
    for (uint8_t i = 0; i < HardwareConfig::INPUT_ONLY_PIN_COUNT; i++) {
        if (HardwareConfig::INPUT_ONLY_PINS[i] == gpio) {
            return true;
        }
    }
    #endif
    return false;
}

bool GPIOManager::verifyPinState(uint8_t pin, uint8_t expected_mode) {
    delay(1);  // Allow pin to stabilize (1ms is sufficient)
    
    if (expected_mode == INPUT_PULLUP) {
        // For INPUT_PULLUP, pin should read HIGH (pulled up)
        int state = digitalRead(pin);
        if (state != HIGH) {
            LOG_WARNING("Pin " + String(pin) + " verification failed - expected HIGH, got " + String(state));
            return false;
        }
    }
    // For OUTPUT mode, we can't verify without external hardware
    // (reading pin value doesn't tell us if OUTPUT is working)
    
    return true;  // Verification passed or not applicable
}

