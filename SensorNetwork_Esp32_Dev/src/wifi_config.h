#ifndef WIFI_CONFIG_H
#define WIFI_CONFIG_H

#include <Arduino.h>
#include <Preferences.h>

// =============================================================================
// WIFI CONFIGURATION STRUCTURE
// =============================================================================

struct WiFiConfig {
    // Core WiFi settings
    String ssid = "";
    String password = "";
    
    // [AgentFix] Konfigurierbare Server-Einstellungen
    String server_address = "192.168.0.198";  // Pi0 Kaiser Edge Controller (Standard)
    int mqtt_port = 1883;                     // MQTT port (default: 1883)
    int http_port = 80;                     // HTTP port (default: 80)
    
    // Authentication (unified)
    String username = "";                     // Single username for all services
    String password_auth = "";                // Single password for all services
    
    // Legacy fields (for backward compatibility)
    String mqtt_server;                       // Mirrors server_address
    String mqtt_user;                         // Mirrors username
    String mqtt_password;                     // Mirrors password_auth
    String pi_server_url;                     // Constructed from server_address + http_port
    String pi_username;                       // Mirrors username
    String pi_password;                       // Mirrors password_auth
    
    // ESP Identity
    String esp_username = "";                 // Technical name for MQTT
    String esp_friendly_name = "";            // User-friendly display name
    String esp_zone = "";
    
    // Status flags
    bool configured = false;
    bool connection_established = false;
    
    // [AgentFix] System state tracking
    String system_state = "BOOT";
    bool webserver_active = false;
    
    // [AgentFix] Konstruktor mit Default-Werten
    WiFiConfig() {
        // Initialize legacy fields to maintain compatibility
        mqtt_server = server_address;
        mqtt_user = username;
        mqtt_password = password_auth;
        pi_username = username;
        pi_password = password_auth;
        updatePiServerURL();
    }
    
    // [AgentFix] Unified server configuration method
    void setServerAddress(const String& address, int http_port = 80) {
        server_address = address;
        mqtt_server = address;  // Maintain backward compatibility
        this->http_port = http_port;
        updatePiServerURL();
    }
    
    // [AgentFix] Port validation methods
    bool isValidPort(int port) const {
        return port >= 1 && port <= 65535;
    }
    
    bool isValidIP(const String& ip) const {
        // Simple IP validation
        int dots = 0;
        for (char c : ip) {
            if (c == '.') dots++;
        }
        return dots == 3 && ip.length() >= 7 && ip.length() <= 15;
    }
    
    // [AgentFix] Getter methods for URLs
    String getPiServerURL() const {
        return "http://" + server_address + ":" + String(http_port);
    }
    
    String getMQTTServerURL() const {
        return server_address + ":" + String(mqtt_port);
    }
    
    // [AgentFix] Enhanced getter methods
    String getServerAddress() const { return server_address; }
    String getUsername() const { return username; }
    String getPassword() const { return password_auth; }
    String getDeviceName() const { return esp_username; }
    String getFriendlyName() const { return esp_friendly_name; }
    int getHttpPort() const { return http_port; }
    int getMQTTPort() const { return mqtt_port; }
    String getSystemState() const { return system_state; }
    bool isWebserverActive() const { return webserver_active; }
    
    // [AgentFix] System state management
    void setSystemState(const String& state) { system_state = state; }
    void setWebserverActive(bool active) { webserver_active = active; }
    void setHttpPort(int port) { 
        if (isValidPort(port)) {
            http_port = port;
            updatePiServerURL();
        }
    }
    void setMQTTPort(int port) { 
        if (isValidPort(port)) {
            mqtt_port = port;
        }
    }
    
    // [AgentFix] ESP identity management
    void setDeviceName(const String& name) { 
        esp_username = name;
        mqtt_user = name;  // Maintain backward compatibility
    }
    void setFriendlyName(const String& name) { esp_friendly_name = name; }
    
    // [AgentFix] Authentication management
    void setCredentials(const String& user, const String& pass) {
        username = user;
        password_auth = pass;
        // Maintain backward compatibility
        mqtt_user = user;
        mqtt_password = pass;
        pi_username = user;
        pi_password = pass;
    }
    
private:
    // [AgentFix] Private helper method
    void updatePiServerURL() {
        pi_server_url = getPiServerURL();
    }
};

// =============================================================================
// CONFIGURATION MANAGEMENT CLASS
// =============================================================================

class ConfigManager {
private:
    Preferences preferences;
    WiFiConfig config;
    
public:
    ConfigManager();
    ~ConfigManager();
    
    // Configuration management
    bool loadConfiguration();
    bool saveConfiguration();
    bool resetConfiguration();
    
    // [AgentFix] Enhanced validation methods
    bool validateConfiguration(const WiFiConfig& config, String& error_message);
    bool testServerConnectivity(const String& server, int port, int timeout = 5000);
    
    // Getters
    WiFiConfig& getConfig() { return config; }
    const WiFiConfig& getConfig() const { return config; }
    
    // [AgentFix] Configuration status
    bool isConfigured() const { return config.configured; }
    String getConfigurationStatus() const;
};

#endif // WIFI_CONFIG_H 