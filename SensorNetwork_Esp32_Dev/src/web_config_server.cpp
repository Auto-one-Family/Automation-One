#include "web_config_server.h"
#include "wifi_config.h"
#include <HTTPClient.h>
#include <WiFiClient.h>
#include <PubSubClient.h>

// Hardware-spezifische Konfiguration
#ifdef ESP32_DEV_MODE
    #include "esp32_dev_config.h"
#else
    #include "xiao_config.h"
#endif

WebConfigServer::WebConfigServer(const String& esp_identifier)
    : server(80), dnsServer(), esp_id(esp_identifier), config_portal_active(false) {
    ap_ssid = "ESP32_Setup_" + esp_id.substring(4);
    ap_password = "12345678";
}

bool WebConfigServer::startConfigPortal() {
    // ✅ FIXED: Verwende WIFI_AP_STA_MODE statt WIFI_AP
    // Das erlaubt sowohl AP (für Portal) als auch STA (für bestehende WiFi-Verbindung)
    WiFi.mode(WIFI_AP_STA);
    WiFi.softAP(ap_ssid.c_str(), ap_password.c_str());

      // ✅ FIXED: Verwende WIFI_AP_STA_MODE statt WIFI_AP
    // Das erlaubt sowohl AP (für Portal) als auch STA (für bestehende WiFi-Verbindung)
    WiFi.mode(WIFI_AP_STA);

    dnsServer.start(53, "*", WiFi.softAPIP());

    server.on("/", HTTP_GET, [this]() { handleRoot(); });
    server.on("/save", HTTP_POST, [this]() { handleSave(); });
    server.on("/reset", HTTP_POST, [this]() { handleReset(); });
    server.on("/status", HTTP_GET, [this]() { handleStatus(); });
    
    // 🆕 NEU: Connectivity Test Endpoints
    server.on("/test-mqtt", HTTP_GET, [this]() { handleTestMQTT(); });
    server.on("/test-pi", HTTP_GET, [this]() { handleTestPi(); });
    server.on("/scan-network", HTTP_GET, [this]() { handleScanNetwork(); });
    server.on("/discover-services", HTTP_GET, [this]() { handleDiscoverServices(); });
    
    server.onNotFound([this]() { handleNotFound(); });

    server.begin();
    config_portal_active = true;
    // ✅ FIXED: Verwende WIFI_AP_STA_MODE statt WIFI_AP
    // Das erlaubt sowohl AP (für Portal) als auch STA (für bestehende WiFi-Verbindung)
    WiFi.mode(WIFI_AP_STA);
    return true;
}

void WebConfigServer::stopConfigPortal() {
    // ✅ FIXED: Verwende WIFI_AP_STA_MODE statt WIFI_AP
    // Das erlaubt sowohl AP (für Portal) als auch STA (für bestehende WiFi-Verbindung)
    WiFi.mode(WIFI_AP_STA);
    server.stop();
    dnsServer.stop();
    WiFi.softAPdisconnect(true);
    
    // ✅ FIXED: Nur AP ausschalten, STA (WiFi-Verbindung) behalten
    WiFi.mode(WIFI_STA);
    
    config_portal_active = false;
    // ✅ FIXED: Verwende WIFI_AP_STA_MODE statt WIFI_AP
    // Das erlaubt sowohl AP (für Portal) als auch STA (für bestehende WiFi-Verbindung)
    WiFi.mode(WIFI_AP_STA);
}

void WebConfigServer::handleClient() {
    server.handleClient();
    dnsServer.processNextRequest();
}

void WebConfigServer::handleRoot() {
    server.send(200, "text/html", getSetupHTML());
}

void WebConfigServer::handleSave() {
    if (server.hasArg("plain")) {
        // Handle JSON data (existing functionality)
        String json_data = server.arg("plain");
        
        DynamicJsonDocument doc(1024);
        DeserializationError error = deserializeJson(doc, json_data);
        
        if (error) {
            server.send(400, "text/html", getErrorHTML("Invalid JSON data"));
            return;
        }
        
        // Process JSON data (existing logic)
        return handleSaveJSON(doc);
    } else {
        // Handle form data (new simplified approach)
        return handleSaveForm();
    }
}

void WebConfigServer::handleSaveForm() {
    // ✅ Get ALL form data
    String ssid = server.arg("wifi_ssid");
    String password = server.arg("wifi_password");
    String server_address = server.arg("server_address");
    String mqtt_port_str = server.arg("mqtt_port");
    String http_port_str = server.arg("http_port");
    String username = server.arg("username");
    String password_auth = server.arg("password_auth");
    String esp_name = server.arg("esp_name");
    String esp_friendly_name = server.arg("esp_friendly_name");
    String esp_zone = server.arg("esp_zone");
    
    // ✅ Validate required fields
    if (ssid.isEmpty()) {
        server.send(400, "text/html", getErrorHTML("WiFi SSID is required"));
        return;
    }
    
    if (password.isEmpty()) {
        server.send(400, "text/html", getErrorHTML("WiFi password is required"));
        return;
    }
    
    if (server_address.isEmpty()) {
        server.send(400, "text/html", getErrorHTML("Server IP is required"));
        return;
    }
    
    if (username.isEmpty()) {
        server.send(400, "text/html", getErrorHTML("Username is required"));
        return;
    }
    
    if (password_auth.isEmpty()) {
        server.send(400, "text/html", getErrorHTML("Password is required"));
        return;
    }
    
    if (esp_name.isEmpty()) {
        server.send(400, "text/html", getErrorHTML("Device name is required"));
        return;
    }
    
    if (esp_friendly_name.isEmpty()) {
        server.send(400, "text/html", getErrorHTML("Display name is required"));
        return;
    }
    
    // ✅ Validate ports
    int mqtt_port = mqtt_port_str.toInt();
    int http_port = http_port_str.toInt();
    
    if (mqtt_port < 1 || mqtt_port > 65535) {
        server.send(400, "text/html", getErrorHTML("MQTT port must be between 1 and 65535"));
        return;
    }
    
    if (http_port < 1 || http_port > 65535) {
        server.send(400, "text/html", getErrorHTML("HTTP port must be between 1 and 65535"));
        return;
    }
    
    // ✅ Validate IP address
    if (!isValidIP(server_address)) {
        server.send(400, "text/html", getErrorHTML("Invalid server IP address"));
        return;
    }
    
    // ✅ Create complete configuration
    WiFiConfig config;
    config.ssid = ssid;
    config.password = password;
    config.setServerAddress(server_address, http_port);
    config.setMQTTPort(mqtt_port);
    config.setCredentials(username, password_auth);
    config.setDeviceName(esp_name);
    config.setFriendlyName(esp_friendly_name);
    config.esp_zone = esp_zone;
    config.configured = true;
    config.system_state = "AWAITING_PI_CONFIG";
    
    // Save configuration
    if (!saveConfiguration(config)) {
        server.send(500, "text/html", getErrorHTML("Failed to save configuration"));
        return;
    }
    
    // Configuration saved successfully
    
    // Send success response
    server.send(200, "text/html", getSuccessHTML());
    
    // ✅ FIXED: Portal sauber stoppen BEVOR Neustart
    stopConfigPortal();
    
    // ✅ Kurze Verzögerung für sauberes Herunterfahren
    delay(500);
    
    // ✅ Neustart mit korrektem WiFi-Modus
    ESP.restart();
}

void WebConfigServer::handleSaveJSON(const JsonDocument& doc) {
    // [AgentFix] Erweiterte Validierung der Eingabedaten
    String validation_error = "";
    if (!validateConfigurationData(doc, validation_error)) {
        server.send(400, "text/html", getErrorHTML("Configuration validation failed: " + validation_error));
        return;
    }
    
    // WiFi settings
    String ssid = doc["wifi_ssid"].as<String>();
    String password = doc["wifi_password"].as<String>();
    
    if (ssid.isEmpty()) {
        server.send(400, "text/html", getErrorHTML("WiFi SSID is required"));
        return;
    }
    
    // [AgentFix] Server settings mit erweiterter Validierung
    String server_addr = doc["server_address"] | "192.168.0.198";
    int mqtt_port = doc["mqtt_port"] | 1883;
    int http_port = doc["http_port"] | 80;  // [AgentFix] HTTP Port aus JSON
    
    // [AgentFix] Port-Validierung
    if (http_port < 1 || http_port > 65535) {
        server.send(400, "text/html", getErrorHTML("HTTP Port must be between 1 and 65535"));
        return;
    }
    
    if (mqtt_port < 1 || mqtt_port > 65535) {
        server.send(400, "text/html", getErrorHTML("MQTT Port must be between 1 and 65535"));
        return;
    }
    
    // [AgentFix] IP-Validierung
    if (!isValidIP(server_addr)) {
        server.send(400, "text/html", getErrorHTML("Invalid server IP address"));
        return;
    }
    
    // Authentication
    String username = doc["username"].as<String>();
    String password_auth = doc["password_auth"].as<String>();
    
    if (username.isEmpty() || password_auth.isEmpty()) {
        server.send(400, "text/html", getErrorHTML("Username and password are required"));
        return;
    }
    
    // ESP Identity
    String esp_name = doc["esp_name"].as<String>();
    String esp_friendly_name = doc["esp_friendly_name"].as<String>();
    String esp_zone = doc["esp_zone"].as<String>();
    
    if (esp_name.isEmpty()) {
        server.send(400, "text/html", getErrorHTML("ESP name is required"));
        return;
    }
    
    // [AgentFix] Konfiguration speichern mit erweiterten Methoden
    WiFiConfig config;
    config.ssid = ssid;
    config.password = password;
    config.setServerAddress(server_addr, http_port);  // [AgentFix] Mit HTTP Port
    config.setMQTTPort(mqtt_port);
    config.setCredentials(username, password_auth);
    config.setDeviceName(esp_name);
    config.setFriendlyName(esp_friendly_name);
    config.esp_zone = esp_zone;
    config.configured = true;
    config.system_state = "AWAITING_PI_CONFIG";  // New state for Pi registration
    
    // [AgentFix] Konfiguration speichern
    if (!saveConfiguration(config)) {
        server.send(500, "text/html", getErrorHTML("Failed to save configuration"));
        return;
    }
    
    // Send success response
    server.send(200, "application/json", "{\"status\":\"success\",\"message\":\"Configuration saved\"}");
    
    // Restart ESP after short delay
    delay(1000);
    ESP.restart();
}

// [AgentFix] Neue Methode: Konfigurationsvalidierung
bool WebConfigServer::validateConfigurationData(const JsonDocument& doc, String& error_message) {
    // Check required fields
    if (!doc.containsKey("wifi_ssid") || doc["wifi_ssid"].as<String>().isEmpty()) {
        error_message = "WiFi SSID is required";
        return false;
    }
    
    if (!doc.containsKey("server_address") || doc["server_address"].as<String>().isEmpty()) {
        error_message = "Server address is required";
        return false;
    }
    
    if (!doc.containsKey("username") || doc["username"].as<String>().isEmpty()) {
        error_message = "Username is required";
        return false;
    }
    
    if (!doc.containsKey("password_auth") || doc["password_auth"].as<String>().isEmpty()) {
        error_message = "Password is required";
        return false;
    }
    
    if (!doc.containsKey("esp_name") || doc["esp_name"].as<String>().isEmpty()) {
        error_message = "ESP name is required";
        return false;
    }
    
    // Validate ports
    int http_port = doc["http_port"] | 80;
    int mqtt_port = doc["mqtt_port"] | 1883;
    
    if (http_port < 1 || http_port > 65535) {
        error_message = "HTTP port must be between 1 and 65535";
        return false;
    }
    
    if (mqtt_port < 1 || mqtt_port > 65535) {
        error_message = "MQTT port must be between 1 and 65535";
        return false;
    }
    
    // Validate IP address
    String server_addr = doc["server_address"].as<String>();
    if (!isValidIP(server_addr)) {
        error_message = "Invalid server IP address";
        return false;
    }
    
    return true;
}

// [AgentFix] Neue Methode: IP-Validierung
bool WebConfigServer::isValidIP(const String& ip) {
    int dots = 0;
    for (char c : ip) {
        if (c == '.') dots++;
    }
    return dots == 3 && ip.length() >= 7 && ip.length() <= 15;
}

void WebConfigServer::handleReset() {
    resetConfiguration();
    server.send(200, "text/html", getSuccessHTML());
    // ✅ FIXED: Verwende WIFI_AP_STA_MODE statt WIFI_AP
    // Das erlaubt sowohl AP (für Portal) als auch STA (für bestehende WiFi-Verbindung)
    WiFi.mode(WIFI_AP_STA);
}

void WebConfigServer::handleStatus() {
    DynamicJsonDocument doc(1024);
    doc["esp_id"] = esp_id;
    doc["ap_ssid"] = ap_ssid;
    doc["ap_ip"] = WiFi.softAPIP().toString();
    doc["uptime"] = millis();
    doc["free_heap"] = ESP.getFreeHeap();
    
    // 🆕 NEU: Erweiterte Verbindungsstatus-Informationen
    doc["wifi_connected"] = (WiFi.status() == WL_CONNECTED);
    if (WiFi.status() == WL_CONNECTED) {
        doc["wifi_ssid"] = WiFi.SSID();
        doc["wifi_ip"] = WiFi.localIP().toString();
        doc["wifi_rssi"] = WiFi.RSSI();
    }
    
    // 🆕 NEU: MQTT-Status (wenn verfügbar)
    extern PubSubClient mqtt_client;  // Forward declaration
    doc["mqtt_connected"] = mqtt_client.connected();
    if (mqtt_client.connected()) {
        doc["mqtt_server"] = "connected";
        doc["mqtt_port"] = 1883;  // Default
    }
    
    // 🆕 NEU: System State (vereinfacht)
    doc["system_state"] = "CONFIG_PORTAL";
    doc["webserver_active"] = true;  // Portal ist aktiv
    
    // 🆕 NEU: Konfigurationsstatus
    WiFiConfig config;
    if (loadConfiguration(config)) {
        doc["configured"] = config.configured;
        doc["server_address"] = config.server_address;
        doc["mqtt_port"] = config.mqtt_port;
        doc["http_port"] = config.http_port;
    } else {
        doc["configured"] = false;
    }
    
    // 🆕 NEU: Verbindungsfortschritt
    doc["connection_progress"] = "setup";  // setup, wifi_connected, mqtt_connected, operational
    if (WiFi.status() == WL_CONNECTED) {
        doc["connection_progress"] = "wifi_connected";
        if (mqtt_client.connected()) {
            doc["connection_progress"] = "mqtt_connected";
        }
    }

    String response;
    ArduinoJson::serializeJson(doc, response);
    server.send(200, "application/json", response);
}

void WebConfigServer::handleNotFound() {
    server.sendHeader("Location", "http://" + WiFi.softAPIP().toString(), true);
    server.send(302, "text/plain", "");
}

void WebConfigServer::handleTestMQTT() {
    String server_ip = server.arg("server");
    int port = server.arg("port").toInt();
    String username = server.arg("username");
    String password = server.arg("password");
    
    if (server_ip.isEmpty()) {
        server.send(400, "application/json", "{\"success\":false,\"error\":\"Server IP required\"}");
        return;
    }
    
    if (port == 0) port = 1883;
    
    bool success = testMqttConnectivity(server_ip, port);
    
    DynamicJsonDocument doc(256);
    doc["success"] = success;
    doc["server"] = server_ip;
    doc["port"] = port;
    if (!success) {
        doc["error"] = "MQTT connection failed";
    }
    
    String response;
    ArduinoJson::serializeJson(doc, response);
    server.send(200, "application/json", response);
}

void WebConfigServer::handleTestPi() {
    if (server.hasArg("plain")) {
        String json_data = server.arg("plain");
        
        DynamicJsonDocument doc(512);
        DeserializationError error = deserializeJson(doc, json_data);
        
        if (error) {
            server.send(400, "application/json", "{\"status\":\"error\",\"message\":\"Invalid JSON\"}");
            return;
        }
        
        String server_addr = doc["server_address"] | "192.168.0.198";
        int http_port = doc["http_port"] | 80;
        
        // [AgentFix] Test Pi-Server Konnektivität
        bool test_success = testPiServerConnectivity(server_addr, http_port);
        
        DynamicJsonDocument response(256);
        if (test_success) {
            response["status"] = "success";
            response["message"] = "Pi server connection successful";
            response["server"] = server_addr;
            response["port"] = http_port;
        } else {
            response["status"] = "error";
            response["message"] = "Pi server connection failed";
            response["server"] = server_addr;
            response["port"] = http_port;
        }
        
        String response_str;
        ArduinoJson::serializeJson(response, response_str);
        server.send(200, "application/json", response_str);
    } else {
        server.send(400, "application/json", "{\"status\":\"error\",\"message\":\"No data received\"}");
    }
}

void WebConfigServer::handleScanNetwork() {
    std::vector<String> devices = discoverNetworkDevices();
    
    DynamicJsonDocument doc(1024);
    JsonArray devices_array = doc.createNestedArray("devices");
    
    for (const String& device : devices) {
        devices_array.add(device);
    }
    
    doc["success"] = true;
    doc["count"] = devices.size();
    
    String response;
    ArduinoJson::serializeJson(doc, response);
    server.send(200, "application/json", response);
}

void WebConfigServer::handleDiscoverServices() {
    std::vector<String> devices = discoverNetworkDevices();
    
    DynamicJsonDocument doc(1024);
    JsonArray servers_array = doc.createNestedArray("servers");
    
    for (const String& device : devices) {
        JsonObject server_obj = servers_array.createNestedObject();
        server_obj["ip"] = device;
        server_obj["name"] = "Raspberry Pi";
        server_obj["type"] = "pi_server";
    }
    
    doc["success"] = true;
    doc["count"] = devices.size();
    
    String response;
    ArduinoJson::serializeJson(doc, response);
    server.send(200, "application/json", response);
}

bool WebConfigServer::testMqttConnectivity(const String& server_ip, int port) {
    WiFiClient wifi_client;
    PubSubClient mqtt_client(wifi_client);
    
    mqtt_client.setServer(server_ip.c_str(), port);
    mqtt_client.setSocketTimeout(5000); // 5 second timeout - ✅ CORRECT METHOD
    
    String client_id = "esp32_test_" + String(random(1000, 9999));
    
    if (mqtt_client.connect(client_id.c_str())) {
        mqtt_client.disconnect();
        return true;
    } else {
        return false;
    }
}

bool WebConfigServer::testPiServerConnectivity(const String& server_addr, int http_port) {
    HTTPClient http;
    String test_url = "http://" + server_addr + ":" + String(http_port) + "/status";
    
    http.begin(test_url);
    http.setTimeout(5000);  // 5 second timeout
    
    int http_code = http.GET();
    String response = http.getString();
    http.end();
    
    bool success = (http_code == HTTP_CODE_OK);
    
    return success;
}

std::vector<String> WebConfigServer::discoverNetworkDevices() {
    std::vector<String> devices;
    
    // Scan common Pi IP addresses
    String gateway = WiFi.gatewayIP().toString();
    String subnet = gateway.substring(0, gateway.lastIndexOf('.') + 1);
    
    int common_ips[] = {100, 101, 102, 1, 2, 3, 4, 5, 10, 20, 50, 91};
    
    for (int ip_suffix : common_ips) {
        String test_ip = subnet + String(ip_suffix);
        if (testPiServerConnectivity(test_ip, 80)) {
            devices.push_back(test_ip);
        }
    }
    
    return devices;
}

// =============================================================================
// MEMORY OPTIMIZATION FOR XIAO ESP32-C3
// =============================================================================

// ✅ Optimierte HTML-Strings für XIAO (PROGMEM für Flash-Speicher)
const char HTML_HEAD[] PROGMEM = "<!DOCTYPE html><html><head><title>ESP32-C3 Setup</title><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1.0\"><style>";
const char HTML_STYLE[] PROGMEM = "body{font-family:Arial,sans-serif;margin:20px;background:#f5f5f5}.container{max-width:600px;margin:0 auto;background:white;padding:30px;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,0.1)}.form-group{margin-bottom:20px}label{display:block;margin-bottom:8px;font-weight:bold;color:#333}input{width:100%;padding:12px;border:2px solid #ddd;border-radius:6px;font-size:14px;box-sizing:border-box}input:focus{border-color:#007bff;outline:none}input[type=number]{width:120px}input[type=number]:focus{border-color:#007bff}.btn{background:#007bff;color:white;padding:12px 20px;border:none;border-radius:6px;cursor:pointer;font-size:14px;margin-right:10px}.btn:hover{background:#0056b3}.section{background:#f8f9fa;padding:20px;margin-bottom:25px;border-radius:8px;border-left:4px solid #007bff}h1{color:#333;text-align:center;margin-bottom:30px}h3{color:#007bff;margin-bottom:15px}.help-text{font-size:12px;color:#666;margin-top:4px}";
const char HTML_END[] PROGMEM = "</style></head><body><div class=\"container\"><h1>🔧 ESP32-C3 Setup</h1>";

// ✅ Optimierte JavaScript für XIAO
const char JS_VALIDATION[] PROGMEM = "<script>document.getElementById('configForm').addEventListener('submit',function(e){const ssid=document.querySelector('input[name=\"wifi_ssid\"]').value;const password=document.querySelector('input[name=\"wifi_password\"]').value;const serverAddress=document.getElementById('server_address').value;const username=document.querySelector('input[name=\"username\"]').value;const passwordAuth=document.querySelector('input[name=\"password_auth\"]').value;const espName=document.querySelector('input[name=\"esp_name\"]').value;const espFriendlyName=document.querySelector('input[name=\"esp_friendly_name\"]').value;if(!ssid||!password||!serverAddress||!username||!passwordAuth||!espName||!espFriendlyName){e.preventDefault();alert('Please fill in all required fields');return false}const ipPattern=/^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;if(!ipPattern.test(serverAddress)){e.preventDefault();alert('Please enter a valid IP address');return false}const mqttPort=parseInt(document.querySelector('input[name=\"mqtt_port\"]').value);const httpPort=parseInt(document.querySelector('input[name=\"http_port\"]').value);if(mqttPort<1||mqttPort>65535||httpPort<1||httpPort>65535){e.preventDefault();alert('Ports must be between 1 and 65535');return false}});</script>";

String WebConfigServer::getSetupHTML() {
    String html;
    html.reserve(4096); // ✅ Erhöht für mehr Felder
    
    // ✅ Lade gespeicherte Konfiguration für Vorbelegung
    WiFiConfig config;
    loadConfiguration(config);
    
    // ✅ Verwende PROGMEM Strings
    html += FPSTR(HTML_HEAD);
    html += FPSTR(HTML_STYLE);
    html += FPSTR(HTML_END);
    
    // ✅ Benutzerführung am Anfang
    html += "<p style='font-size:14px;color:#444;margin-bottom:25px;text-align:center'>";
    html += "Gib hier die Netzwerkeinstellungen und einen Namen für dein Gerät ein.<br>";
    html += "Alle Felder sind erklärt und voreingestellt – du kannst sie jederzeit ändern.";
    html += "</p>";
    
    // ✅ Vollständige Form-Struktur mit allen 9 Feldern
    html += "<form method=\"POST\" action=\"/save\" id=\"configForm\">";
    
    // WiFi Section
    html += "<div class=\"section\"><h3>📶 WiFi</h3>";
    html += "<div class=\"form-group\"><label>SSID:</label><input type=\"text\" name=\"wifi_ssid\" value=\"" + config.ssid + "\" required></div>";
    html += "<div class=\"form-group\"><label>Password:</label><input type=\"password\" name=\"wifi_password\" value=\"" + config.password + "\" required></div>";
    html += "</div>";
    
    // Server Section
    html += "<div class=\"section\"><h3>🖥️ Server</h3>";
    html += "<div class=\"form-group\"><label>IP Address <span title=\"IP-Adresse des Raspberry Pi oder Pi-Servers\">❔</span>:</label><input type=\"text\" id=\"server_address\" name=\"server_address\" value=\"" + config.server_address + "\" required></div>";
    html += "<div class=\"form-group\"><label>MQTT Port <span title=\"Port für MQTT-Verbindung (Standard: 1883)\">❔</span>:</label><input type=\"number\" name=\"mqtt_port\" value=\"" + String(config.mqtt_port) + "\" min=\"1\" max=\"65535\" required></div>";
    html += "<div class=\"form-group\"><label>HTTP Port <span title=\"Port für HTTP-Verbindung (Standard: 80)\">❔</span>:</label><input type=\"number\" name=\"http_port\" value=\"" + String(config.http_port) + "\" min=\"1\" max=\"65535\" required></div>";
    html += "</div>";
    
    // Authentication Section
    html += "<div class=\"section\"><h3>🔐 Authentication</h3>";
    html += "<div class=\"form-group\"><label>Username <span title=\"Benutzername für MQTT und Pi-Server\">❔</span>:</label><input type=\"text\" name=\"username\" value=\"" + config.username + "\" required></div>";
    html += "<div class=\"form-group\"><label>Password <span title=\"Passwort für MQTT und Pi-Server\">❔</span>:</label><input type=\"password\" name=\"password_auth\" value=\"" + config.password_auth + "\" required></div>";
    html += "</div>";
    
    // Device Section
    html += "<div class=\"section\"><h3>📱 Device</h3>";
    html += "<div class=\"form-group\"><label>Technical Name <span title=\"Technischer Name für MQTT-Topics\">❔</span>:</label><input type=\"text\" name=\"esp_name\" value=\"" + config.esp_username + "\" required></div>";
    html += "<div class=\"form-group\"><label>Display Name <span title=\"Anzeigename im Dashboard\">❔</span>:</label><input type=\"text\" name=\"esp_friendly_name\" value=\"" + config.esp_friendly_name + "\" required></div>";
    html += "<div class=\"form-group\"><label>Zone <span title=\"Zone oder Gruppe (z.B. Garten rechts)\">❔</span>:</label><input type=\"text\" name=\"esp_zone\" value=\"" + config.esp_zone + "\" placeholder=\"e.g. Garden Right\"></div>";
    html += "</div>";
    
    // Buttons
    html += "<div class=\"form-group\" style=\"text-align:center;margin-top:30px;\">";
    html += "<button type=\"submit\" class=\"btn\">💾 Save</button>";
    html += "<button type=\"button\" class=\"btn\" onclick=\"location.href='/reset'\">🔄 Reset</button>";
    html += "</div></form>";
    
    // ✅ Status-Anzeige (erweitert für ESP32 Dev)
    html += "<div id=\"status\" style=\"margin-top:20px;padding:10px;background:#f8f9fa;border-radius:5px;\">";
    html += "<p><strong>Status:</strong> <span id=\"status-text\">Ready</span></p>";
    
    // ESP32 Dev kann mehr Features anzeigen
    #ifdef ESP32_DEV_MODE
        html += "<div style=\"margin-top:15px;padding:10px;background:#e9ecef;border-radius:3px;\">";
        html += "<h4 style=\"margin:0 0 10px 0;color:#495057;\">🔧 Advanced Status</h4>";
        html += "<div style=\"display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:12px;\">";
        html += "<div><strong>Free Heap:</strong> " + String(ESP.getFreeHeap()) + " bytes</div>";
        html += "<div><strong>Chip ID:</strong> " + String(ESP.getChipModel()) + "</div>";
        html += "<div><strong>Flash Size:</strong> " + String(ESP.getFlashChipSize()) + " bytes</div>";
        html += "<div><strong>Board:</strong> ESP32 Dev</div>";
        html += "</div></div>";
    #endif
    
    html += "</div>";
    
    // ✅ Optimiertes JavaScript
    html += FPSTR(JS_VALIDATION);
    
    html += "</div></body></html>";
    return html;
}

// ✅ Optimierte HTML-Templates für XIAO
const char HTML_SUCCESS[] PROGMEM = "<!DOCTYPE html><html><head><title>Success</title><meta charset=\"UTF-8\"><style>body{font-family:Arial;text-align:center;padding:50px}.container{max-width:500px;margin:0 auto}.success{color:#28a745;font-size:48px;margin-bottom:20px}</style></head><body><div class=\"container\"><div class=\"success\">✅</div><h1>Configuration Saved!</h1><p>ESP32 will restart and connect to WiFi.</p></div></body></html>";

const char HTML_ERROR_START[] PROGMEM = "<!DOCTYPE html><html><head><title>Error</title><meta charset=\"UTF-8\"><style>body{font-family:Arial;text-align:center;padding:50px}.container{max-width:500px;margin:0 auto}.error{color:#dc3545;font-size:48px;margin-bottom:20px}.btn{background:#007bff;color:white;padding:10px 20px;text-decoration:none}</style></head><body><div class=\"container\"><div class=\"error\">❌</div><h1>Configuration Error</h1><p>";
const char HTML_ERROR_END[] PROGMEM = "</p><a href=\"/\" class=\"btn\">Try Again</a></div></body></html>";

String WebConfigServer::getSuccessHTML() {
    return FPSTR(HTML_SUCCESS);
}

String WebConfigServer::getErrorHTML(const String& error) {
    String html;
    html.reserve(512); // ✅ Pre-allocate memory für XIAO
    html += FPSTR(HTML_ERROR_START);
    html += error;
    html += FPSTR(HTML_ERROR_END);
    return html;
}

bool WebConfigServer::loadConfiguration(WiFiConfig& config) {
    preferences.begin("wifi_config", true);
    
    // ✅ FIXED: Load mit neuen Feldnamen
    config.ssid = preferences.getString("ssid", "");
    config.password = preferences.getString("password", "");
    config.server_address = preferences.getString("server_address", "");
    config.mqtt_port = preferences.getInt("mqtt_port", 1883);
    config.username = preferences.getString("username", "");
    config.password_auth = preferences.getString("password_auth", "");
    config.esp_username = preferences.getString("esp_name", "");
    // ✅ FIXED: Use shorter key name to avoid KEY_TOO_LONG error with backward compatibility
    config.esp_friendly_name = preferences.getString("friendly", "");
    if (config.esp_friendly_name.isEmpty()) {
        config.esp_friendly_name = preferences.getString("esp_friendly_name", "");
    }
    config.esp_zone = preferences.getString("esp_zone", "");
    config.configured = preferences.getBool("configured", false);
    // ✅ FIXED: Use shorter key name to avoid KEY_TOO_LONG error with backward compatibility
    config.connection_established = preferences.getBool("conn", false);
    if (!config.connection_established) {
        config.connection_established = preferences.getBool("connection_established", false);
    }
    config.http_port = preferences.getInt("http_p", 80);
    config.system_state = preferences.getString("sys_st", "BOOT");
    config.webserver_active = preferences.getBool("web_act", false);
    
    // ✅ FIXED: Legacy-Felder für Backward Compatibility
    if (config.server_address.isEmpty()) {
        config.server_address = preferences.getString("srv", "192.168.1.100");
    }
    if (config.mqtt_port == 1883) {
        config.mqtt_port = preferences.getInt("port", 1883);
    }
    if (config.username.isEmpty()) {
        config.username = preferences.getString("user", "");
    }
    if (config.password_auth.isEmpty()) {
        config.password_auth = preferences.getString("mqtt_pw", "");
    }
    if (config.esp_username.isEmpty()) {
        config.esp_username = preferences.getString("esp_usr", "");
    }
    if (config.esp_zone.isEmpty()) {
        config.esp_zone = preferences.getString("zone", "");
    }
    if (!config.configured) {
        config.configured = preferences.getBool("cfg", false);
    }
    if (!config.connection_established) {
        config.connection_established = preferences.getBool("conn", false);
    }
    
    // Legacy-Felder für Kompatibilität
    config.mqtt_server = config.server_address;
    config.mqtt_user = config.username;
    config.mqtt_password = config.password_auth;
    config.pi_server_url = "http://" + config.server_address + ":" + String(config.http_port);
    config.pi_username = config.username;
    config.pi_password = config.password_auth;
    
    preferences.end();
    return true;
}

bool WebConfigServer::saveConfiguration(const WiFiConfig& config) {
    preferences.begin("wifi_config", false);
    
    // ✅ FIXED: Save mit neuen Feldnamen für Kompatibilität
    preferences.putString("ssid", config.ssid);
    preferences.putString("password", config.password);
    
    // ✅ FIXED: Neue Feldnamen für Server-Konfiguration
    preferences.putString("server_address", config.server_address);
    preferences.putInt("mqtt_port", config.mqtt_port);
    preferences.putString("username", config.username);
    preferences.putString("password_auth", config.password_auth);
    preferences.putString("esp_name", config.esp_username);
    // ✅ FIXED: Use shorter key name to avoid KEY_TOO_LONG error
    preferences.putString("friendly", config.esp_friendly_name);
    // ✅ FIXED: Also save legacy key for backward compatibility
    preferences.putString("esp_friendly_name", config.esp_friendly_name);
    preferences.putString("esp_zone", config.esp_zone);
    
    // ✅ FIXED: Legacy-Felder für Backward Compatibility
    preferences.putString("srv", config.server_address);  // Für main.cpp loadWiFiConfigFromPreferences
    preferences.putInt("port", config.mqtt_port);
    preferences.putString("user", config.username);
    preferences.putString("mqtt_pw", config.password_auth);
    preferences.putString("pi_url", config.pi_server_url);
    preferences.putString("pi_usr", config.pi_username);
    preferences.putString("pi_pw", config.pi_password);
    preferences.putString("esp_usr", config.esp_username);
    preferences.putString("zone", config.esp_zone);
    
    // Status-Felder
    preferences.putBool("configured", config.configured);
    // ✅ FIXED: Use shorter key name to avoid KEY_TOO_LONG error
    preferences.putBool("conn", config.connection_established);
    // ✅ FIXED: Also save legacy key for backward compatibility
    preferences.putBool("connection_established", config.connection_established);
    preferences.putInt("http_p", config.http_port);
    preferences.putString("sys_st", config.system_state);
    preferences.putBool("web_act", config.webserver_active);
    
    preferences.end();
    return true;
}

void WebConfigServer::resetConfiguration() {
    preferences.begin("wifi_config", false);
    preferences.clear();
    preferences.end();
}

bool WebConfigServer::isConfigPortalActive() {
    return config_portal_active;
}