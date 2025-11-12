#ifndef NETWORK_DISCOVERY_H
#define NETWORK_DISCOVERY_H

#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClient.h>
#include <HTTPClient.h>
#include <PubSubClient.h>
#include <vector>
#include <ESPmDNS.h>

// =============================================================================
// NETWORK DISCOVERY CLASS
// =============================================================================

class NetworkDiscovery {
private:
    WiFiClient client;
    String last_known_pi_ip;
    unsigned long last_scan_time = 0;
    const unsigned long SCAN_INTERVAL = 300000; // 5 Minuten
    
public:
    NetworkDiscovery();
    ~NetworkDiscovery();
    
    // Pi Discovery Methods
    String discoverRaspberryPi();
    std::vector<String> scanNetworkForPiDevices();
    bool testPiServerAvailability(const String& ip, int port = 80);
    String resolveCurrentPiIP();
    void updateKnownPiIP(const String& ip);
    
    // [AgentFix] ESP32-spezifische Discovery-Methoden
    std::vector<String> scanNetworkForESP32Nodes();
    bool testESP32WebConfig(const String& ip);
    bool testESP32MQTT(const String& ip);
    void sendESP32DiscoveryNotification(const String& esp32_ip);
    
    // Network Scanning
    std::vector<String> scanCommonPorts(const String& ip, std::vector<int> ports);
    bool isDeviceReachable(const String& ip, int port, int timeout = 1000);
    
    // Status and Information
    String getLastKnownPiIP() const { return last_known_pi_ip; }
    unsigned long getLastScanTime() const { return last_scan_time; }
    bool shouldRescan() const;
};

// =============================================================================
// DYNAMIC IP MANAGER CLASS
// =============================================================================

class DynamicIPManager {
private:
    NetworkDiscovery* discovery;
    String configured_pi_ip;
    bool use_mdns_fallback = true;
    unsigned long last_ip_check = 0;
    const unsigned long IP_CHECK_INTERVAL = 60000; // 1 Minute
    
public:
    DynamicIPManager(NetworkDiscovery* discovery_ptr);
    ~DynamicIPManager();
    
    // IP Management
    String getCurrentPiIP();
    bool updatePiIPIfChanged();
    void enableMDNSFallback(bool enable);
    void setConfiguredIP(const String& ip);
    
    // Status
    bool isIPStable() const;
    String getConfiguredIP() const { return configured_pi_ip; }
    bool isMDNSEnabled() const { return use_mdns_fallback; }
    
    // Manual IP Resolution
    String forceIPResolution();
    bool validateIP(const String& ip);
};

// =============================================================================
// NETWORK UTILITY FUNCTIONS
// =============================================================================

namespace NetworkUtils {
    String getGatewayIP();
    String getSubnetPrefix();
    bool isValidIP(const String& ip);
    String pingHost(const String& ip, int timeout = 1000);
    std::vector<String> getCommonPiIPs();
}

#endif // NETWORK_DISCOVERY_H 