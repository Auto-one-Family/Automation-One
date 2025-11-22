#include "network_discovery.h"
#include <ArduinoJson.h>
#include "wifi_config.h"

// =============================================================================
// NETWORK DISCOVERY IMPLEMENTATION
// =============================================================================

NetworkDiscovery::NetworkDiscovery() {
    Serial.println("[NetworkDiscovery] Initializing network discovery system");
    last_known_pi_ip = "";
    last_scan_time = 0;
}

NetworkDiscovery::~NetworkDiscovery() {
    Serial.println("[NetworkDiscovery] Cleaning up network discovery");
}

String NetworkDiscovery::discoverRaspberryPi() {
    Serial.println("[NetworkDiscovery] Starting mDNS discovery for Raspberry Pi");
    
    // Initialize mDNS if not already done
    if (!MDNS.begin("esp32_discovery")) {
        Serial.println("[NetworkDiscovery] ERROR: Failed to start mDNS");
        return "";
    }
    
    // Method 1: Direct hostname lookup for "raspberrypi.local"
    Serial.println("[NetworkDiscovery] Trying direct hostname lookup: raspberrypi.local");
    IPAddress pi_ip = MDNS.queryHost("raspberrypi");
    if (pi_ip != INADDR_NONE) {
        String discovered_ip = pi_ip.toString();
        Serial.printf("[NetworkDiscovery] Found Pi via hostname: %s\n", discovered_ip.c_str());
        updateKnownPiIP(discovered_ip);
        return discovered_ip;
    }
    
    // Method 2: Service discovery for HTTP services
    Serial.println("[NetworkDiscovery] Scanning for HTTP services...");
    int n = MDNS.queryService("http", "tcp");
    Serial.printf("[NetworkDiscovery] Found %d HTTP services\n", n);
    
    for (int i = 0; i < n; ++i) {
        String hostname = MDNS.hostname(i);
        String ip = MDNS.IP(i).toString();
        
        Serial.printf("[NetworkDiscovery] Service %d: %s at %s\n", i, hostname.c_str(), ip.c_str());
        
        // Check if this looks like a Raspberry Pi
        if (hostname.indexOf("raspberrypi") >= 0 || 
            hostname.indexOf("pi") >= 0 ||
            hostname.indexOf("raspberry") >= 0) {
            
            // Verify it's actually a Pi by testing the health endpoint
            if (testPiServerAvailability(ip, 80)) {
                Serial.printf("[NetworkDiscovery] Confirmed Pi via service discovery: %s\n", ip.c_str());
                updateKnownPiIP(ip);
                return ip;
            }
        }
    }
    
    // Method 3: Try common Pi hostnames
    String common_hostnames[] = {"raspberrypi", "pi", "raspberry", "homeassistant", "hassio"};
    for (const String& hostname : common_hostnames) {
        IPAddress ip = MDNS.queryHost(hostname);
        if (ip != INADDR_NONE) {
            String discovered_ip = ip.toString();
            if (testPiServerAvailability(discovered_ip, 80)) {
                Serial.printf("[NetworkDiscovery] Found Pi via common hostname '%s': %s\n", 
                             hostname.c_str(), discovered_ip.c_str());
                updateKnownPiIP(discovered_ip);
                return discovered_ip;
            }
        }
    }
    
    Serial.println("[NetworkDiscovery] No Pi found via mDNS discovery");
    return "";
}

std::vector<String> NetworkDiscovery::scanNetworkForPiDevices() {
    Serial.println("[NetworkDiscovery] Starting network scan for Pi devices");
    std::vector<String> found_devices;
    
    // Get network information
    String gateway = NetworkUtils::getGatewayIP();
    String subnet = NetworkUtils::getSubnetPrefix();
    
    if (gateway.isEmpty() || subnet.isEmpty()) {
        Serial.println("[NetworkDiscovery] ERROR: Cannot determine network configuration");
        return found_devices;
    }
    
    Serial.printf("[NetworkDiscovery] Scanning subnet: %sxxx\n", subnet.c_str());
    
    // Get common Pi IP addresses
    std::vector<String> common_ips = NetworkUtils::getCommonPiIPs();

    // [AgentFix] Pi-Server-IP aus WiFiConfig bevorzugt scannen
    extern WiFiConfig wifi_config;
    String configured_ip = wifi_config.getServerAddress();
    if (!configured_ip.isEmpty()) {
        // ✅ FIXED: Stelle sicher, dass configured_ip nur eine IP-Adresse ist
        if (configured_ip.startsWith("http://")) {
            configured_ip = configured_ip.substring(7); // Entferne "http://"
            int colon_pos = configured_ip.indexOf(':');
            if (colon_pos != -1) {
                configured_ip = configured_ip.substring(0, colon_pos); // Nur IP-Adresse
            }
        }
        
        bool already_in_list = false;
        for (const String& ip_suffix : common_ips) {
            if (subnet + ip_suffix == configured_ip || ip_suffix == configured_ip) {
                already_in_list = true;
                break;
            }
        }
        if (!already_in_list) {
            common_ips.insert(common_ips.begin(), configured_ip);
        }
    }
    
    // Scan each IP address
    for (const String& ip_entry : common_ips) {
        String test_ip = ip_entry;
        // Wenn ip_entry keine Punkte enthält, ist es ein Suffix und muss ergänzt werden
        if (ip_entry.indexOf('.') == -1) {
            test_ip = subnet + ip_entry;
        }
        Serial.printf("[NetworkDiscovery] Testing IP: %s\n", test_ip.c_str());
        // Quick ping test first
        if (NetworkUtils::pingHost(test_ip, 2000) != "") {
            // If ping successful, test for Pi server
            if (testPiServerAvailability(test_ip, 80)) {
                Serial.printf("[NetworkDiscovery] Found Pi device: %s\n", test_ip.c_str());
                found_devices.push_back(test_ip);
            }
        }
        // Small delay to avoid overwhelming the network
        delay(50);
    }
    
    last_scan_time = millis();
    Serial.printf("[NetworkDiscovery] Network scan completed. Found %d Pi devices\n", found_devices.size());
    
    return found_devices;
}

bool NetworkDiscovery::testPiServerAvailability(const String& ip, int port) {
    HTTPClient http;
    String url = "http://" + ip + ":" + String(port) + "/api/health";
    
    Serial.printf("[NetworkDiscovery] Testing Pi server: %s\n", url.c_str());
    
    http.begin(url);
    http.setTimeout(2000); // 2 second timeout for faster scanning
    
    int http_code = http.GET();
    http.end();
    
    bool success = (http_code == HTTP_CODE_OK);
    
    if (success) {
        Serial.printf("[NetworkDiscovery] ✅ Pi server available: %s:%d (HTTP: %d)\n", 
                     ip.c_str(), port, http_code);
    } else {
        Serial.printf("[NetworkDiscovery] ❌ Pi server not available: %s:%d (HTTP: %d)\n", 
                     ip.c_str(), port, http_code);
    }
    
    return success;
}

String NetworkDiscovery::resolveCurrentPiIP() {
    // First try mDNS discovery
    if (!last_known_pi_ip.isEmpty()) {
        Serial.printf("[NetworkDiscovery] Trying last known Pi IP: %s\n", last_known_pi_ip.c_str());
        if (testPiServerAvailability(last_known_pi_ip, 80)) {
            return last_known_pi_ip;
        }
    }
    
    // Try mDNS discovery
    String mdns_ip = discoverRaspberryPi();
    if (!mdns_ip.isEmpty()) {
        return mdns_ip;
    }
    
    // Fallback to network scan
    Serial.println("[NetworkDiscovery] mDNS failed, falling back to network scan");
    std::vector<String> devices = scanNetworkForPiDevices();
    
    if (!devices.empty()) {
        String discovered_ip = devices[0]; // Use first found device
        updateKnownPiIP(discovered_ip);
        return discovered_ip;
    }
    
    Serial.println("[NetworkDiscovery] No Pi devices found");
    return "";
}

void NetworkDiscovery::updateKnownPiIP(const String& ip) {
    if (ip != last_known_pi_ip) {
        Serial.printf("[NetworkDiscovery] Updating known Pi IP: %s → %s\n", 
                     last_known_pi_ip.c_str(), ip.c_str());
        last_known_pi_ip = ip;
    }
}

std::vector<String> NetworkDiscovery::scanCommonPorts(const String& ip, std::vector<int> ports) {
    std::vector<String> open_ports;
    
    for (int port : ports) {
        if (isDeviceReachable(ip, port, 2000)) {
            open_ports.push_back(String(port));
        }
    }
    
    return open_ports;
}

bool NetworkDiscovery::isDeviceReachable(const String& ip, int port, int timeout) {
    WiFiClient client;
    // Ensure timeout is at least 1 second to prevent 0ms timeouts
    int timeout_seconds = max(1, timeout / 1000);
    client.setTimeout(timeout_seconds);
    
    if (client.connect(ip.c_str(), port)) {
        client.stop();
        return true;
    }
    
    return false;
}

bool NetworkDiscovery::shouldRescan() const {
    return (millis() - last_scan_time) > SCAN_INTERVAL;
}

// [AgentFix] ESP32-spezifische Discovery-Methoden implementieren
std::vector<String> NetworkDiscovery::scanNetworkForESP32Nodes() {
    Serial.println("[NetworkDiscovery] Starting ESP32 node discovery scan");
    std::vector<String> found_esp32_nodes;
    
    // Get network information
    String gateway = NetworkUtils::getGatewayIP();
    String subnet = NetworkUtils::getSubnetPrefix();
    
    if (gateway.isEmpty() || subnet.isEmpty()) {
        Serial.println("[NetworkDiscovery] ERROR: Cannot determine network configuration");
        return found_esp32_nodes;
    }
    
    Serial.printf("[NetworkDiscovery] Scanning subnet: %sxxx for ESP32 nodes (100-200)\n", subnet.c_str());
    
    // [AgentFix] Scan IP-Bereich 100-200 für ESP32-Geräte
    for (int last_octet = 100; last_octet <= 200; last_octet++) {
        String test_ip = subnet + String(last_octet);
        
        // Quick ping test first
        if (NetworkUtils::pingHost(test_ip, 1000) != "") {
            Serial.printf("[NetworkDiscovery] Testing ESP32 candidate: %s\n", test_ip.c_str());
            
            // [AgentFix] Test für ESP32-spezifische Services
            bool is_esp32 = false;
            
            // Test Web Config Portal (Port 80)
            if (isDeviceReachable(test_ip, 80, 2000)) {
                if (testESP32WebConfig(test_ip)) {
                    is_esp32 = true;
                    Serial.printf("[NetworkDiscovery] ✅ Found ESP32 Web Config: %s\n", test_ip.c_str());
                }
            }
            
            // Test MQTT connectivity (Port 1883)
            if (isDeviceReachable(test_ip, 1883, 2000)) {
                if (testESP32MQTT(test_ip)) {
                    is_esp32 = true;
                    Serial.printf("[NetworkDiscovery] ✅ Found ESP32 MQTT: %s\n", test_ip.c_str());
                }
            }
            
            // Test Pi Server Port (80) für ESP32 mit Pi-Integration
            if (isDeviceReachable(test_ip, 80, 2000)) {
                if (testPiServerAvailability(test_ip, 80)) {
                    is_esp32 = true;
                    Serial.printf("[NetworkDiscovery] ✅ Found ESP32 with Pi Server: %s\n", test_ip.c_str());
                }
            }
            
            if (is_esp32) {
                found_esp32_nodes.push_back(test_ip);
                
                // [AgentFix] MQTT-Benachrichtigung über gefundenen ESP32
                sendESP32DiscoveryNotification(test_ip);
            }
        }
        
        // Small delay to avoid overwhelming the network
        delay(20);
    }
    
    last_scan_time = millis();
    Serial.printf("[NetworkDiscovery] ESP32 scan completed. Found %d ESP32 nodes\n", found_esp32_nodes.size());
    return found_esp32_nodes;
}

// [AgentFix] Neue Methode: ESP32 Web Config Test
bool NetworkDiscovery::testESP32WebConfig(const String& ip) {
    HTTPClient http;
    String url = "http://" + ip + "/status";
    
    Serial.printf("[NetworkDiscovery] Testing ESP32 Web Config: %s\n", url.c_str());
    
    http.begin(url);
    http.setTimeout(2000);
    
    int http_code = http.GET();
    String response = http.getString();
    http.end();
    
    // [AgentFix] Check für ESP32-spezifische Response-Patterns
    bool is_esp32 = (http_code == HTTP_CODE_OK && 
                    (response.indexOf("esp_id") >= 0 || 
                     response.indexOf("ESP32") >= 0 ||
                     response.indexOf("ap_ssid") >= 0 ||
                     response.indexOf("uptime") >= 0));
    
    if (is_esp32) {
        Serial.printf("[NetworkDiscovery] ✅ ESP32 Web Config confirmed: %s\n", ip.c_str());
    } else {
        Serial.printf("[NetworkDiscovery] ❌ Not an ESP32 Web Config: %s (HTTP: %d)\n", ip.c_str(), http_code);
    }
    
    return is_esp32;
}

// [AgentFix] Neue Methode: ESP32 MQTT Test
bool NetworkDiscovery::testESP32MQTT(const String& ip) {
    WiFiClient wifi_client;
    PubSubClient mqtt_client(wifi_client);
    
    Serial.printf("[NetworkDiscovery] Testing ESP32 MQTT: %s:1883\n", ip.c_str());
    
    mqtt_client.setServer(ip.c_str(), 1883);
    mqtt_client.setSocketTimeout(3000);
    
    String client_id = "discovery_test_" + String(random(1000, 9999));
    
    if (mqtt_client.connect(client_id.c_str())) {
        // [AgentFix] Subscribe to ESP32 topics to verify it's an ESP32
        bool has_esp_topics = mqtt_client.subscribe("kaiser/+/esp/+/status", 0);
        bool has_esp_config = mqtt_client.subscribe("kaiser/+/esp/+/config", 0);
        
        mqtt_client.disconnect();
        
        bool is_esp32 = has_esp_topics || has_esp_config;
        
        if (is_esp32) {
            Serial.printf("[NetworkDiscovery] ✅ ESP32 MQTT confirmed: %s\n", ip.c_str());
        } else {
            Serial.printf("[NetworkDiscovery] ❌ Not an ESP32 MQTT: %s\n", ip.c_str());
        }
        
        return is_esp32;
    }
    
    Serial.printf("[NetworkDiscovery] ❌ MQTT connection failed: %s\n", ip.c_str());
    return false;
}

// [AgentFix] Neue Methode: MQTT-Benachrichtigung über ESP32-Entdeckung
void NetworkDiscovery::sendESP32DiscoveryNotification(const String& esp32_ip) {
    // [AgentFix] Externe MQTT-Client-Referenz benötigt - wird über globale Variable gelöst
    extern PubSubClient mqtt_client;
    extern String esp_id;
    extern String kaiser_zone_id;
    
    if (!mqtt_client.connected()) {
        Serial.printf("[NetworkDiscovery] Cannot send notification - MQTT not connected\n");
        return;
    }
    
    DynamicJsonDocument doc(256);
    doc["discovery_type"] = "esp32_node";
    doc["discovered_ip"] = esp32_ip;
    doc["timestamp"] = millis();
    doc["scanner_id"] = esp_id;
    doc["scan_method"] = "network_scan";
    
    String notification;
    ArduinoJson::serializeJson(doc, notification);
    
    String topic = "kaiser/" + kaiser_zone_id + "/discovery/esp32_nodes";
    mqtt_client.publish(topic.c_str(), notification.c_str());
    
    Serial.printf("[NetworkDiscovery] MQTT notification sent for ESP32: %s\n", esp32_ip.c_str());
}

// =============================================================================
// DYNAMIC IP MANAGER IMPLEMENTATION
// =============================================================================

DynamicIPManager::DynamicIPManager(NetworkDiscovery* discovery_ptr) {
    discovery = discovery_ptr;
    configured_pi_ip = "";
    use_mdns_fallback = true;
    last_ip_check = 0;
    
    Serial.println("[DynamicIPManager] Initialized with network discovery");
}

DynamicIPManager::~DynamicIPManager() {
    Serial.println("[DynamicIPManager] Cleaning up dynamic IP manager");
}

String DynamicIPManager::getCurrentPiIP() {
    if (!discovery) {
        Serial.println("[DynamicIPManager] ERROR: No discovery instance available");
        return configured_pi_ip;
    }
    
    // Check if we need to update the IP
    if (updatePiIPIfChanged()) {
        Serial.printf("[DynamicIPManager] IP updated to: %s\n", configured_pi_ip.c_str());
    }
    
    return configured_pi_ip;
}

bool DynamicIPManager::updatePiIPIfChanged() {
    if (!discovery) return false;
    
    // Check if it's time to verify the IP
    if ((millis() - last_ip_check) < IP_CHECK_INTERVAL) {
        return false; // Not time to check yet
    }
    
    last_ip_check = millis();
    
    // If we have a configured IP, test it first
    if (!configured_pi_ip.isEmpty()) {
        if (discovery->testPiServerAvailability(configured_pi_ip, 80)) {
            return false; // Current IP is still working
        } else {
            Serial.printf("[DynamicIPManager] Configured IP %s is no longer reachable\n", 
                         configured_pi_ip.c_str());
        }
    }
    
    // Try to resolve a new IP
    String new_ip = discovery->resolveCurrentPiIP();
    
    if (!new_ip.isEmpty() && new_ip != configured_pi_ip) {
        Serial.printf("[DynamicIPManager] IP changed: %s → %s\n", 
                     configured_pi_ip.c_str(), new_ip.c_str());
        configured_pi_ip = new_ip;
        return true;
    }
    
    return false;
}

void DynamicIPManager::enableMDNSFallback(bool enable) {
    use_mdns_fallback = enable;
    Serial.printf("[DynamicIPManager] mDNS fallback %s\n", enable ? "enabled" : "disabled");
}

void DynamicIPManager::setConfiguredIP(const String& ip) {
    if (validateIP(ip)) {
        configured_pi_ip = ip;
        Serial.printf("[DynamicIPManager] Set configured IP: %s\n", ip.c_str());
    } else {
        Serial.printf("[DynamicIPManager] ERROR: Invalid IP address: %s\n", ip.c_str());
    }
}

bool DynamicIPManager::isIPStable() const {
    return !configured_pi_ip.isEmpty() && (millis() - last_ip_check) < IP_CHECK_INTERVAL;
}

String DynamicIPManager::forceIPResolution() {
    if (!discovery) return "";
    
    Serial.println("[DynamicIPManager] Forcing IP resolution");
    String new_ip = discovery->resolveCurrentPiIP();
    
    if (!new_ip.isEmpty()) {
        configured_pi_ip = new_ip;
        last_ip_check = millis();
    }
    
    return new_ip;
}

bool DynamicIPManager::validateIP(const String& ip) {
    return NetworkUtils::isValidIP(ip);
}

// =============================================================================
// NETWORK UTILITY FUNCTIONS
// =============================================================================

namespace NetworkUtils {
    
    String getGatewayIP() {
        if (WiFi.status() != WL_CONNECTED) {
            return "";
        }
        return WiFi.gatewayIP().toString();
    }
    
    String getSubnetPrefix() {
        String gateway = getGatewayIP();
        if (gateway.isEmpty()) {
            return "";
        }
        
        int last_dot = gateway.lastIndexOf('.');
        if (last_dot == -1) {
            return "";
        }
        
        return gateway.substring(0, last_dot + 1);
    }
    
    bool isValidIP(const String& ip) {
        if (ip.isEmpty()) return false;
        
        // Simple IP validation
        int dots = 0;
        for (size_t i = 0; i < ip.length(); i++) {
            if (ip.charAt(i) == '.') dots++;
        }
        
        if (dots != 3) return false;
        
        // Check each octet
        int start = 0;
        for (int i = 0; i < 4; i++) {
            int end = ip.indexOf('.', start);
            if (end == -1 && i < 3) return false;
            if (end == -1) end = ip.length();
            
            String octet = ip.substring(start, end);
            int value = octet.toInt();
            
            if (value < 0 || value > 255) return false;
            if (octet.length() > 1 && octet.charAt(0) == '0') return false; // No leading zeros
            
            start = end + 1;
        }
        
        return true;
    }
    
    String pingHost(const String& ip, int timeout) {
        WiFiClient client;
        // Ensure timeout is at least 1 second to prevent 0ms timeouts
        int timeout_seconds = max(1, timeout / 1000);
        client.setTimeout(timeout_seconds);
        
        if (client.connect(ip.c_str(), 80)) {
            client.stop();
            return ip; // Return IP if reachable
        }
        
        return ""; // Return empty string if not reachable
    }
    
    std::vector<String> getCommonPiIPs() {
        std::vector<String> ips;
        
        // Common Pi IP suffixes
        int common_suffixes[] = {100, 101, 102, 1, 2, 3, 4, 5, 10, 20, 50, 91, 200, 201, 202};
        
        for (int suffix : common_suffixes) {
            ips.push_back(String(suffix));
        }
        
        return ips;
    }
} 