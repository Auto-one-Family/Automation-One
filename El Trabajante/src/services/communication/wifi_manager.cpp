#include "wifi_manager.h"
#include "../../models/error_codes.h"

// ============================================
// CONSTANTS
// ============================================
const unsigned long RECONNECT_INTERVAL_MS = 30000;  // 30 seconds
const uint16_t MAX_RECONNECT_ATTEMPTS = 10;
const unsigned long WIFI_TIMEOUT_MS = 10000;  // 10 seconds

// ============================================
// GLOBAL WIFI MANAGER INSTANCE
// ============================================
WiFiManager& wifiManager = WiFiManager::getInstance();

// ============================================
// SINGLETON IMPLEMENTATION
// ============================================
WiFiManager& WiFiManager::getInstance() {
    static WiFiManager instance;
    return instance;
}

// ============================================
// CONSTRUCTOR / DESTRUCTOR
// ============================================
WiFiManager::WiFiManager() 
    : last_reconnect_attempt_(0),
      reconnect_attempts_(0),
      initialized_(false) {
}

WiFiManager::~WiFiManager() {
    disconnect();
}

// ============================================
// INITIALIZATION
// ============================================
bool WiFiManager::begin() {
    if (initialized_) {
        LOG_WARNING("WiFiManager already initialized");
        return true;
    }
    
    WiFi.mode(WIFI_STA);
    WiFi.setAutoReconnect(false);  // We handle reconnection manually
    
    initialized_ = true;
    LOG_INFO("WiFiManager initialized");
    return true;
}

// ============================================
// CONNECTION MANAGEMENT
// ============================================
bool WiFiManager::connect(const WiFiConfig& config) {
    if (!initialized_) {
        LOG_ERROR("WiFiManager not initialized");
        errorTracker.logCommunicationError(ERROR_WIFI_INIT_FAILED, 
                                           "WiFiManager not initialized");
        return false;
    }
    
    // Validate config
    if (config.ssid.length() == 0) {
        LOG_ERROR("WiFi SSID is empty");
        errorTracker.logCommunicationError(ERROR_WIFI_NO_SSID, 
                                           "WiFi SSID is empty");
        return false;
    }
    
    current_config_ = config;
    reconnect_attempts_ = 0;
    
    return connectToNetwork();
}

bool WiFiManager::connectToNetwork() {
    LOG_INFO("Connecting to WiFi: " + current_config_.ssid);
    
    WiFi.begin(current_config_.ssid.c_str(), 
               current_config_.password.c_str());
    
    // Wait for connection with timeout
    unsigned long start_time = millis();
    while (WiFi.status() != WL_CONNECTED) {
        if (millis() - start_time > WIFI_TIMEOUT_MS) {
            LOG_ERROR("WiFi connection timeout");
            errorTracker.logCommunicationError(ERROR_WIFI_CONNECT_TIMEOUT, 
                                               "WiFi connection timeout");
            return false;
        }
        delay(100);
    }
    
    LOG_INFO("WiFi connected! IP: " + WiFi.localIP().toString());
    LOG_INFO("WiFi RSSI: " + String(WiFi.RSSI()) + " dBm");
    
    reconnect_attempts_ = 0;
    return true;
}

bool WiFiManager::disconnect() {
    if (WiFi.status() == WL_CONNECTED) {
        WiFi.disconnect(true);
        LOG_INFO("WiFi disconnected");
    }
    return true;
}

bool WiFiManager::isConnected() const {
    return WiFi.status() == WL_CONNECTED;
}

void WiFiManager::reconnect() {
    if (isConnected()) {
        LOG_DEBUG("WiFi already connected");
        return;
    }
    
    if (!shouldAttemptReconnect()) {
        return;
    }
    
    reconnect_attempts_++;
    last_reconnect_attempt_ = millis();
    
    LOG_INFO("Attempting WiFi reconnection (attempt " + 
             String(reconnect_attempts_) + "/" + 
             String(MAX_RECONNECT_ATTEMPTS) + ")");
    
    if (!connectToNetwork()) {
        if (reconnect_attempts_ >= MAX_RECONNECT_ATTEMPTS) {
            LOG_CRITICAL("Max WiFi reconnection attempts reached");
            errorTracker.logCommunicationError(ERROR_WIFI_CONNECT_FAILED, 
                                               "Max reconnection attempts reached");
        }
    }
}

// ============================================
// MONITORING
// ============================================
void WiFiManager::loop() {
    if (!initialized_) {
        return;
    }
    
    // Check connection status
    if (!isConnected()) {
        handleDisconnection();
    }
}

void WiFiManager::handleDisconnection() {
    static bool disconnection_logged = false;
    
    if (!disconnection_logged) {
        LOG_WARNING("WiFi disconnected");
        errorTracker.logCommunicationError(ERROR_WIFI_DISCONNECT, 
                                           "WiFi connection lost");
        disconnection_logged = true;
    }
    
    reconnect();
    
    if (isConnected()) {
        disconnection_logged = false;
    }
}

bool WiFiManager::shouldAttemptReconnect() const {
    // Don't attempt if max attempts reached
    if (reconnect_attempts_ >= MAX_RECONNECT_ATTEMPTS) {
        return false;
    }
    
    // Wait for reconnect interval
    unsigned long current_time = millis();
    if (current_time - last_reconnect_attempt_ < RECONNECT_INTERVAL_MS) {
        return false;
    }
    
    return true;
}

// ============================================
// STATUS GETTERS
// ============================================
String WiFiManager::getConnectionStatus() const {
    switch (WiFi.status()) {
        case WL_CONNECTED:
            return "Connected";
        case WL_NO_SSID_AVAIL:
            return "SSID not available";
        case WL_CONNECT_FAILED:
            return "Connection failed";
        case WL_CONNECTION_LOST:
            return "Connection lost";
        case WL_DISCONNECTED:
            return "Disconnected";
        case WL_IDLE_STATUS:
            return "Idle";
        default:
            return "Unknown";
    }
}

int8_t WiFiManager::getRSSI() const {
    return WiFi.RSSI();
}

IPAddress WiFiManager::getLocalIP() const {
    return WiFi.localIP();
}

String WiFiManager::getSSID() const {
    return WiFi.SSID();
}

