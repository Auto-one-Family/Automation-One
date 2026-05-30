#include "mhz19_uart.h"
#include "../utils/logger.h"
#include "../error_handling/error_tracker.h"
#include "../models/error_codes.h"

static const char* TAG = "MHZ19";

// MH-Z19 warmup after power-on (~3 min per datasheet)
static const unsigned long MHZ19_WARMUP_MS = 180000;
static const uint16_t MHZ19_READ_TIMEOUT_MS = 200;
static const uint16_t MHZ19_MAX_PPM = 50000;

static const uint8_t MHZ19_CMD_READ_PPM[9] = {
    0xFF, 0x01, 0x86, 0x00, 0x00, 0x00, 0x00, 0x00, 0x79
};

Mhz19UartReader& mhz19UartReader = Mhz19UartReader::getInstance();

Mhz19UartReader::Mhz19UartReader()
    : initialized_(false), rx_pin_(255), tx_pin_(255), baud_(9600) {}

bool Mhz19UartReader::begin(uint8_t rx_pin, uint8_t tx_pin, uint32_t baud) {
    if (rx_pin == 255 || tx_pin == 255 || baud == 0) {
        LOG_E(TAG, "Mhz19Uart: invalid pins rx=" + String(rx_pin) +
                   " tx=" + String(tx_pin) + " baud=" + String(baud));
        errorTracker.trackError(ERROR_UART_INIT_FAILED, ERROR_SEVERITY_ERROR,
                               "Invalid UART pin/baud for CO2");
        return false;
    }

    if (initialized_ && rx_pin_ == rx_pin && tx_pin_ == tx_pin && baud_ == baud) {
        LOG_D(TAG, "Mhz19Uart: already on Serial2 rx=" + String(rx_pin_) +
                   " tx=" + String(tx_pin_));
        return true;
    }

    if (initialized_) {
        Serial2.end();
        initialized_ = false;
    }

    rx_pin_ = rx_pin;
    tx_pin_ = tx_pin;
    baud_ = baud;

    Serial2.begin(baud_, SERIAL_8N1, rx_pin_, tx_pin_);
    while (Serial2.available() > 0) {
        Serial2.read();
    }

    initialized_ = true;
    LOG_I(TAG, "Mhz19Uart: Serial2 begin baud=" + String(baud_) +
              " rx=" + String(rx_pin_) + " tx=" + String(tx_pin_));
    return true;
}

void Mhz19UartReader::end() {
    if (initialized_) {
        Serial2.end();
        initialized_ = false;
        rx_pin_ = 255;
        tx_pin_ = 255;
    }
}

bool Mhz19UartReader::validateChecksum(const uint8_t* frame, size_t len) {
    if (frame == nullptr || len < 9) {
        return false;
    }
    uint8_t sum = 0;
    for (size_t i = 1; i < 8; i++) {
        sum = static_cast<uint8_t>(sum + frame[i]);
    }
    sum = static_cast<uint8_t>((~sum) + 1);
    return sum == frame[8];
}

bool Mhz19UartReader::readRawPpm(uint16_t& ppm_out) {
    ppm_out = 0;
    if (!initialized_) {
        LOG_E(TAG, "Mhz19Uart: read without begin()");
        errorTracker.trackError(ERROR_UART_INIT_FAILED, ERROR_SEVERITY_ERROR,
                               "UART CO2 not initialized");
        return false;
    }

    while (Serial2.available() > 0) {
        Serial2.read();
    }

    const size_t written = Serial2.write(MHZ19_CMD_READ_PPM, sizeof(MHZ19_CMD_READ_PPM));
    if (written != sizeof(MHZ19_CMD_READ_PPM)) {
        LOG_E(TAG, "Mhz19Uart: write failed");
        errorTracker.trackError(ERROR_UART_READ_TIMEOUT, ERROR_SEVERITY_ERROR,
                               "UART CO2 write failed");
        return false;
    }

    uint8_t response[9] = {0};
    size_t received = 0;
    const unsigned long deadline = millis() + MHZ19_READ_TIMEOUT_MS;

    while (received < sizeof(response) && static_cast<long>(millis() - deadline) < 0) {
        if (Serial2.available() > 0) {
            response[received++] = static_cast<uint8_t>(Serial2.read());
        }
    }

    if (received < sizeof(response)) {
        LOG_W(TAG, "Mhz19Uart: timeout after " + String(received) + " bytes");
        errorTracker.trackError(ERROR_UART_READ_TIMEOUT, ERROR_SEVERITY_WARNING,
                               "UART CO2 read timeout");
        return false;
    }

    if (response[0] != 0xFF) {
        LOG_W(TAG, "Mhz19Uart: bad start byte 0x" + String(response[0], HEX));
        errorTracker.trackError(ERROR_UART_CHECKSUM_FAILED, ERROR_SEVERITY_WARNING,
                               "UART CO2 bad frame start");
        return false;
    }

    if (!validateChecksum(response, sizeof(response))) {
        LOG_W(TAG, "Mhz19Uart: checksum mismatch");
        errorTracker.trackError(ERROR_UART_CHECKSUM_FAILED, ERROR_SEVERITY_WARNING,
                               "UART CO2 checksum failed");
        return false;
    }

    const uint16_t ppm = static_cast<uint16_t>(
        (static_cast<uint16_t>(response[2]) << 8) | response[3]);

    if (ppm > MHZ19_MAX_PPM) {
        LOG_W(TAG, "Mhz19Uart: PPM out of range: " + String(ppm));
        errorTracker.trackError(ERROR_UART_INVALID_PPM, ERROR_SEVERITY_WARNING,
                               "UART CO2 PPM out of range");
        return false;
    }

    ppm_out = ppm;
    return true;
}
