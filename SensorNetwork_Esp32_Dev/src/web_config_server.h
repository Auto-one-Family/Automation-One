#ifndef WEB_CONFIG_SERVER_H
#define WEB_CONFIG_SERVER_H

#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <Preferences.h>
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include "wifi_config.h"

class WebConfigServer {
private:
    WebServer server;
    DNSServer dnsServer;
    Preferences preferences;
    
    // Configuration data
    String esp_id;
    String ap_ssid;
    String ap_password;
    bool config_portal_active;  // 🆕 NEU: Portal status tracking
    
    // HTML templates
    String getSetupHTML();
    String getSuccessHTML();
    String getErrorHTML(const String& error);
    
    // Form handling
    void handleRoot();
    void handleSave();
    void handleSaveForm();  // 🆕 NEU: Simplified form handling
    void handleSaveJSON(const JsonDocument& doc);  // 🆕 NEU: JSON handling
    void handleReset();
    void handleStatus();
    
    // 🆕 NEU: Service Discovery Endpoints
    void handleTestConnection();
    void handleDiscoverServices();
    void handleTestMQTT();
    void handleTestPi();
    void handleScanNetwork();
    
    // DNS captive portal
    void handleNotFound();
    
    // [AgentFix] Neue private Hilfsmethoden
    bool validateConfigurationData(const JsonDocument& doc, String& error_message);
    bool isValidIP(const String& ip);
    
public:
    WebConfigServer(const String& esp_identifier);
    
    // Main functions
    bool startConfigPortal();
    void stopConfigPortal();
    void handleClient();
    
    // Configuration management
    bool loadConfiguration(WiFiConfig& config);
    bool saveConfiguration(const WiFiConfig& config);
    void resetConfiguration();
    
    // 🆕 NEU: Service Discovery Functions
    bool testMqttConnectivity(const String& server_ip, int port);
    bool testPiServerConnectivity(const String& server_addr, int http_port);
    std::vector<int> scanCommonPorts(const String& server_ip, std::vector<int> ports);
    std::vector<String> discoverNetworkDevices();
    
    // Status
    bool isConfigPortalActive();
    
    // Helper methods
    String getAPSSID() const { return ap_ssid; }
};

#endif // WEB_CONFIG_SERVER_H 