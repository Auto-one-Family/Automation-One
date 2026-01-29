#ifndef DRIVERS_I2C_BUS_H
#define DRIVERS_I2C_BUS_H

#include <Arduino.h>
#include <Wire.h>

// ============================================
// I2C Bus Manager - Hardware Abstraction Layer
// ============================================
// Phase 3: Hardware Abstraction Layer
// Documentation: Phase_3.md lines 151-235
// Architecture: Server-Centric (Pi-Enhanced Mode)
//
// Purpose: I2C bus control and raw data reading for sensors
// - Board-agnostic I2C initialization (XIAO ESP32-C3 / ESP32-WROOM-32)
// - Multi-device support with bus scanning
// - Raw data reading for Pi-Enhanced processing
// - GPIO Manager integration for pin safety

// ============================================
// I2C BUS MANAGER CLASS
// ============================================
// Singleton class managing I2C bus operations

class I2CBusManager {
public:
    // ============================================
    // SINGLETON PATTERN
    // ============================================
    static I2CBusManager& getInstance() {
        static I2CBusManager instance;
        return instance;
    }

    // Prevent copy and move operations
    I2CBusManager(const I2CBusManager&) = delete;
    I2CBusManager& operator=(const I2CBusManager&) = delete;
    I2CBusManager(I2CBusManager&&) = delete;
    I2CBusManager& operator=(I2CBusManager&&) = delete;

    // ============================================
    // LIFECYCLE MANAGEMENT
    // ============================================
    // Initialize I2C bus with hardware-specific pins
    // Loads pin configuration from HardwareConfig
    // Reserves pins via GPIOManager
    // Returns false if initialization fails
    bool begin();

    // Deinitialize I2C bus and release pins
    void end();

    // ============================================
    // BUS SCANNING
    // ============================================
    // Scan I2C bus for connected devices (0x08-0x77)
    // addresses: Array to store found device addresses
    // max_addresses: Maximum size of addresses array
    // found_count: Output parameter with number of found devices
    // Returns false if scan fails
    bool scanBus(uint8_t addresses[], uint8_t max_addresses, uint8_t& found_count);

    // Check if a specific I2C device is present at address
    bool isDevicePresent(uint8_t address);

    // ============================================
    // RAW DATA READING (PI-ENHANCED MODE)
    // ============================================
    // Read raw bytes from I2C device register
    // device_address: 7-bit I2C address (0x00-0x7F)
    // register_address: Register to read from
    // buffer: Output buffer for received data
    // length: Number of bytes to read
    // Returns false if device not found or read fails
    bool readRaw(uint8_t device_address, uint8_t register_address, 
                 uint8_t* buffer, size_t length);

    // Write raw bytes to I2C device register
    // device_address: 7-bit I2C address (0x00-0x7F)
    // register_address: Register to write to
    // data: Data to write
    // length: Number of bytes to write
    // Returns false if device not found or write fails
    bool writeRaw(uint8_t device_address, uint8_t register_address,
                  const uint8_t* data, size_t length);

    // ============================================
    // STATUS QUERIES
    // ============================================
    // Check if I2C bus is initialized
    bool isInitialized() const { return initialized_; }

    // Get detailed bus status for debugging
    // Format: "I2C[SDA:4,SCL:5,Freq:100kHz,Init:true,RecoveryAttempts:0]"
    String getBusStatus() const;

    // ============================================
    // I2C BUS RECOVERY
    // ============================================
    // Attempt to recover a stuck I2C bus by sending 9 clock pulses
    // and generating a STOP condition. Returns true if bus is functional.
    bool recoverBus();

    // Check if recovery is needed and attempt it (max 3 attempts per minute)
    // Returns true if recovery was successful, false otherwise
    bool attemptRecoveryIfNeeded(uint8_t error_code);

private:
    // ============================================
    // PRIVATE CONSTRUCTOR (SINGLETON)
    // ============================================
    I2CBusManager() 
        : initialized_(false), 
          sda_pin_(0), 
          scl_pin_(0), 
          frequency_(100000) {}
    
    ~I2CBusManager() {}

    // ============================================
    // INTERNAL STATE
    // ============================================
    bool initialized_;      // Bus initialization status
    uint8_t sda_pin_;       // SDA pin (from HardwareConfig)
    uint8_t scl_pin_;       // SCL pin (from HardwareConfig)
    uint32_t frequency_;    // Bus frequency in Hz (typically 100kHz)
};

// ============================================
// GLOBAL INSTANCE ACCESS
// ============================================
extern I2CBusManager& i2cBusManager;

#endif // DRIVERS_I2C_BUS_H
