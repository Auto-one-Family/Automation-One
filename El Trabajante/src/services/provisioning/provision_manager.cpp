#include "provision_manager.h"
#include "../../services/config/config_manager.h"
#include "../../services/config/storage_manager.h"
#include "../../models/error_codes.h"
#include <ArduinoJson.h>

// ============================================
// HTML LANDING PAGE (Captive Portal)
// ============================================
const char* ProvisionManager::HTML_LANDING_PAGE = R"rawliteral(
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AutomationOne - Provisioning</title>
  <style>
    body { 
      font-family: Arial, sans-serif; 
      max-width: 600px; 
      margin: 50px auto; 
      padding: 20px;
      background: #f5f5f5;
    }
    h1 { 
      color: #1976d2; 
      border-bottom: 2px solid #1976d2;
      padding-bottom: 10px;
    }
    .info { 
      background: #e3f2fd; 
      padding: 15px; 
      border-radius: 5px; 
      margin: 20px 0;
      border-left: 4px solid #1976d2;
    }
    .info p { 
      margin: 8px 0; 
      font-size: 14px;
    }
    .status { 
      color: #ff9800; 
      font-weight: bold; 
    }
    .label {
      font-weight: bold;
      display: inline-block;
      width: 140px;
    }
    ol {
      background: white;
      padding: 20px 20px 20px 40px;
      border-radius: 5px;
    }
    li {
      margin: 10px 0;
      line-height: 1.6;
    }
    code {
      background: #263238;
      color: #aed581;
      padding: 2px 6px;
      border-radius: 3px;
      font-family: 'Courier New', monospace;
    }
    .api-section {
      background: white;
      padding: 15px;
      border-radius: 5px;
      margin: 15px 0;
    }
  </style>
</head>
<body>
  <h1>🤖 AutomationOne ESP32</h1>
  
  <div class="info">
    <p><span class="label">ESP ID:</span> %ESP_ID%</p>
    <p><span class="label">MAC Address:</span> %MAC_ADDRESS%</p>
    <p><span class="label">Chip Model:</span> %CHIP_MODEL%</p>
    <p><span class="label">Status:</span> <span class="status">Waiting for configuration</span></p>
    <p><span class="label">Uptime:</span> %UPTIME% seconds</p>
    <p><span class="label">Free Heap:</span> %HEAP_FREE% bytes</p>
  </div>
  
  <h2>📋 Provisioning Instructions</h2>
  <ol>
    <li>Open the <strong>God-Kaiser web interface</strong></li>
    <li>Navigate to <strong>"ESP Provisioning"</strong></li>
    <li>Select this device from the list</li>
    <li>Configure WiFi credentials and Zone settings</li>
    <li>Click <strong>"Provision"</strong></li>
    <li>Wait for ESP to reboot (~5 seconds)</li>
  </ol>
  
  <h2>🔌 API Information</h2>
  <div class="api-section">
    <p><strong>Provision:</strong> <code>POST http://192.168.4.1/provision</code></p>
    <p><strong>Status:</strong> <code>GET http://192.168.4.1/status</code></p>
    <p><strong>Reset:</strong> <code>POST http://192.168.4.1/reset</code></p>
  </div>
  
  <p style="text-align: center; color: #666; margin-top: 40px;">
    AutomationOne v4.0 | El Trabajante
  </p>
</body>
</html>
)rawliteral";

// ============================================
// GLOBAL PROVISION MANAGER INSTANCE
// ============================================
ProvisionManager& provisionManager = ProvisionManager::getInstance();

// ============================================
// SINGLETON IMPLEMENTATION
// ============================================
ProvisionManager& ProvisionManager::getInstance() {
  static ProvisionManager instance;
  return instance;
}

ProvisionManager::ProvisionManager()
  : state_(PROVISION_IDLE),
    server_(nullptr),
    esp_id_(""),
    config_received_(false),
    ap_start_time_(0),
    state_start_time_(0),
    retry_count_(0),
    initialized_(false) {
}

ProvisionManager::~ProvisionManager() {
  if (server_) {
    delete server_;
    server_ = nullptr;
  }
}

// ============================================
// INITIALIZATION & LIFECYCLE
// ============================================
bool ProvisionManager::begin() {
  if (initialized_) {
    LOG_WARNING("ProvisionManager already initialized");
    return true;
  }
  
  LOG_INFO("╔════════════════════════════════════════╗");
  LOG_INFO("║  PROVISION MANAGER INITIALIZATION     ║");
  LOG_INFO("╚════════════════════════════════════════╝");
  
  // Get ESP ID from global system config
  esp_id_ = configManager.getESPId();
  
  if (esp_id_.length() == 0) {
    LOG_ERROR("ProvisionManager: ESP ID not available");
    errorTracker.trackError(ERROR_SYSTEM_INIT_FAILED, 
                           ERROR_SEVERITY_CRITICAL,
                           "ESP ID not available for provisioning");
    return false;
  }
  
  LOG_INFO("ESP ID: " + esp_id_);
  
  initialized_ = true;
  state_ = PROVISION_IDLE;
  
  LOG_INFO("ProvisionManager initialized successfully");
  return true;
}

bool ProvisionManager::needsProvisioning() const {
  WiFiConfig config = configManager.getWiFiConfig();
  
  // Check if config is marked as configured
  if (!config.configured) {
    LOG_INFO("ProvisionManager: Config not marked as configured");
    return true;
  }
  
  // Check if SSID is empty
  if (config.ssid.length() == 0) {
    LOG_INFO("ProvisionManager: WiFi SSID is empty");
    return true;
  }
  
  // Config seems valid
  return false;
}

bool ProvisionManager::startAPMode() {
  if (!initialized_) {
    LOG_ERROR("ProvisionManager not initialized");
    return false;
  }
  
  LOG_INFO("╔════════════════════════════════════════╗");
  LOG_INFO("║  STARTING ACCESS POINT MODE           ║");
  LOG_INFO("╚════════════════════════════════════════╝");
  
  ap_start_time_ = millis();
  retry_count_ = 0;
  config_received_ = false;
  
  // Start WiFi AP
  if (!startWiFiAP()) {
    LOG_ERROR("Failed to start WiFi AP");
    transitionTo(PROVISION_ERROR);
    return false;
  }
  
  // Start HTTP Server
  if (!startHTTPServer()) {
    LOG_ERROR("Failed to start HTTP Server");
    transitionTo(PROVISION_ERROR);
    return false;
  }
  
  // Start mDNS (optional - non-critical)
  if (!startMDNS()) {
    LOG_WARNING("Failed to start mDNS (optional feature)");
    // Continue anyway
  }
  
  // Transition to AP_MODE state
  transitionTo(PROVISION_AP_MODE);
  
  LOG_INFO("╔════════════════════════════════════════╗");
  LOG_INFO("║  ACCESS POINT MODE ACTIVE             ║");
  LOG_INFO("╚════════════════════════════════════════╝");
  LOG_INFO("Please connect to this ESP and configure:");
  LOG_INFO("  1. Connect to WiFi SSID: AutoOne-" + esp_id_);
  LOG_INFO("  2. Password: provision");
  LOG_INFO("  3. Open browser: http://192.168.4.1");
  LOG_INFO("  4. Or use API: POST http://192.168.4.1/provision");
  LOG_INFO("Timeout: " + String(AP_MODE_TIMEOUT_MS / 60000) + " minutes");
  
  return true;
}

bool ProvisionManager::waitForConfig(uint32_t timeout_ms) {
  if (state_ != PROVISION_AP_MODE && state_ != PROVISION_WAITING_CONFIG) {
    LOG_ERROR("ProvisionManager: Not in AP-Mode or Waiting state");
    return false;
  }
  
  LOG_INFO("Waiting for configuration (timeout: " + String(timeout_ms / 1000) + " seconds)");
  
  unsigned long start_time = millis();
  
  while (millis() - start_time < timeout_ms) {
    // Process HTTP requests
    loop();
    
    // Check if config received
    if (config_received_) {
      LOG_INFO("✅ Configuration received successfully");
      transitionTo(PROVISION_COMPLETE);
      return true;
    }
    
    // Check for timeout
    if (checkTimeouts()) {
      // Timeout occurred
      LOG_ERROR("❌ Provisioning timeout");
      return false;
    }
    
    // Small delay to prevent watchdog issues
    delay(10);
  }
  
  // Timeout reached
  LOG_ERROR("❌ Wait timeout reached");
  transitionTo(PROVISION_TIMEOUT);
  return false;
}

void ProvisionManager::stop() {
  LOG_INFO("Stopping Provision Manager");
  
  // Stop HTTP Server
  if (server_) {
    server_->stop();
    delete server_;
    server_ = nullptr;
  }
  
  // Stop mDNS
  MDNS.end();
  
  // Stop AP
  WiFi.softAPdisconnect(true);
  
  transitionTo(PROVISION_IDLE);
  
  LOG_INFO("Provision Manager stopped");
}

// ============================================
// STATE MANAGEMENT
// ============================================
String ProvisionManager::getStateString() const {
  return getStateString(state_);
}

String ProvisionManager::getStateString(ProvisionState state) const {
  switch (state) {
    case PROVISION_IDLE:
      return "IDLE";
    case PROVISION_AP_MODE:
      return "AP_MODE";
    case PROVISION_WAITING_CONFIG:
      return "WAITING_CONFIG";
    case PROVISION_CONFIG_RECEIVED:
      return "CONFIG_RECEIVED";
    case PROVISION_COMPLETE:
      return "COMPLETE";
    case PROVISION_TIMEOUT:
      return "TIMEOUT";
    case PROVISION_ERROR:
      return "ERROR";
    default:
      return "UNKNOWN";
  }
}

bool ProvisionManager::transitionTo(ProvisionState new_state) {
  if (state_ == new_state) {
    return true;  // Already in this state
  }
  
  LOG_INFO("Provision State Transition: " + getStateString(state_) + " → " + getStateString(new_state));
  
  state_ = new_state;
  state_start_time_ = millis();
  
  return true;
}

bool ProvisionManager::checkTimeouts() {
  unsigned long current_time = millis();
  unsigned long elapsed = current_time - state_start_time_;
  
  switch (state_) {
    case PROVISION_AP_MODE:
    case PROVISION_WAITING_CONFIG:
      if (elapsed > AP_MODE_TIMEOUT_MS) {
        LOG_WARNING("⏰ AP-Mode timeout reached (" + String(AP_MODE_TIMEOUT_MS / 60000) + " minutes)");
        transitionTo(PROVISION_TIMEOUT);
        
        // Check retry count
        if (retry_count_ < MAX_RETRY_COUNT) {
          retry_count_++;
          LOG_INFO("Retrying provisioning (attempt " + String(retry_count_ + 1) + "/" + String(MAX_RETRY_COUNT + 1) + ")");
          
          // Restart provisioning
          stop();
          delay(1000);
          startAPMode();
          
          return false;  // Continue waiting
        } else {
          LOG_CRITICAL("❌ Max provisioning retries reached (" + String(MAX_RETRY_COUNT) + ")");
          enterSafeMode();
          return true;  // Timeout
        }
      }
      break;
      
    default:
      break;
  }
  
  return false;  // No timeout
}

void ProvisionManager::enterSafeMode() {
  LOG_CRITICAL("╔════════════════════════════════════════╗");
  LOG_CRITICAL("║  ENTERING SAFE-MODE                   ║");
  LOG_CRITICAL("║  Provisioning failed after retries    ║");
  LOG_CRITICAL("╚════════════════════════════════════════╝");
  
  // Update system state
  SystemConfig sys_config = configManager.getSystemConfig();
  sys_config.current_state = STATE_SAFE_MODE;
  sys_config.safe_mode_reason = "Provisioning timeout after " + String(MAX_RETRY_COUNT) + " retries";
  configManager.saveSystemConfig(sys_config);
  
  // Track error
  errorTracker.trackError(ERROR_SYSTEM_SAFE_MODE,
                         ERROR_SEVERITY_CRITICAL,
                         "Provisioning failed - Safe-Mode active");
  
  // Keep AP-Mode active (unlimited timeout in Safe-Mode)
  LOG_INFO("AP-Mode remains active for manual intervention");
  LOG_INFO("Connect to: AutoOne-" + esp_id_ + " (password: provision)");
  LOG_INFO("Use HTTP API or restart ESP with valid config");
  
  // Blink LED pattern (if GPIO 2 available)
  pinMode(2, OUTPUT);
  for (int i = 0; i < 10; i++) {
    digitalWrite(2, HIGH);
    delay(200);
    digitalWrite(2, LOW);
    delay(200);
  }
}

// ============================================
// LOOP (Call regularly during provisioning)
// ============================================
void ProvisionManager::loop() {
  if (server_ && (state_ == PROVISION_AP_MODE || state_ == PROVISION_WAITING_CONFIG)) {
    server_->handleClient();
  }
}

// ============================================
// WIFI & SERVER SETUP
// ============================================
bool ProvisionManager::startWiFiAP() {
  LOG_INFO("Starting WiFi Access Point...");
  
  String ssid = "AutoOne-" + esp_id_;
  String password = "provision";
  
  // Configure AP
  // softAP(ssid, password, channel, hidden, max_connections)
  bool success = WiFi.softAP(ssid.c_str(), password.c_str(), 1, 0, 1);
  
  if (!success) {
    LOG_ERROR("Failed to start WiFi AP");
    errorTracker.trackError(ERROR_WIFI_INIT_FAILED,
                           ERROR_SEVERITY_CRITICAL,
                           "WiFi.softAP() failed");
    return false;
  }
  
  // Get AP IP
  IPAddress ip = WiFi.softAPIP();
  
  LOG_INFO("✅ WiFi AP started:");
  LOG_INFO("  SSID: " + ssid);
  LOG_INFO("  Password: " + password);
  LOG_INFO("  IP Address: " + ip.toString());
  LOG_INFO("  Channel: 1");
  LOG_INFO("  Max Connections: 1");
  
  return true;
}

bool ProvisionManager::startHTTPServer() {
  LOG_INFO("Starting HTTP Server...");
  
  // Create WebServer instance
  server_ = new WebServer(80);
  
  if (!server_) {
    LOG_ERROR("Failed to allocate WebServer");
    errorTracker.trackError(ERROR_SYSTEM_INIT_FAILED, 
                           ERROR_SEVERITY_CRITICAL,
                           "WebServer allocation failed");
    return false;
  }
  
  // Register HTTP handlers
  server_->on("/", HTTP_GET, [this]() { this->handleRoot(); });
  server_->on("/provision", HTTP_POST, [this]() { this->handleProvision(); });
  server_->on("/status", HTTP_GET, [this]() { this->handleStatus(); });
  server_->on("/reset", HTTP_POST, [this]() { this->handleReset(); });
  server_->onNotFound([this]() { this->handleNotFound(); });
  
  // Start server
  server_->begin();
  
  LOG_INFO("✅ HTTP Server started on port 80");
  LOG_INFO("  Endpoints:");
  LOG_INFO("    GET  / (Landing page)");
  LOG_INFO("    POST /provision (Config submission)");
  LOG_INFO("    GET  /status (ESP status)");
  LOG_INFO("    POST /reset (Factory reset)");
  
  return true;
}

bool ProvisionManager::startMDNS() {
  LOG_INFO("Starting mDNS...");
  
  // Extract short ID (e.g., "ESP_AB12CD" → "ab12cd")
  String hostname = esp_id_;
  hostname.replace("ESP_", "");
  hostname.toLowerCase();
  
  // Start mDNS
  if (!MDNS.begin(hostname.c_str())) {
    LOG_WARNING("Failed to start mDNS");
    return false;
  }
  
  // Advertise HTTP service
  MDNS.addService("http", "tcp", 80);
  MDNS.addService("autoone", "tcp", 80);
  
  LOG_INFO("✅ mDNS started:");
  LOG_INFO("  Hostname: " + hostname + ".local");
  LOG_INFO("  Services: http, autoone");
  
  return true;
}

// ============================================
// HTTP HANDLERS
// ============================================
void ProvisionManager::handleRoot() {
  LOG_DEBUG("HTTP GET /");
  
  String html = String(HTML_LANDING_PAGE);
  
  // Replace placeholders
  html.replace("%ESP_ID%", esp_id_);
  html.replace("%MAC_ADDRESS%", WiFi.macAddress());
  html.replace("%CHIP_MODEL%", ESP.getChipModel());
  html.replace("%UPTIME%", String(getUptimeSeconds()));
  html.replace("%HEAP_FREE%", String(ESP.getFreeHeap()));
  
  server_->send(200, "text/html", html);
  
  // Transition to WAITING_CONFIG if not already
  if (state_ == PROVISION_AP_MODE) {
    transitionTo(PROVISION_WAITING_CONFIG);
  }
}

void ProvisionManager::handleProvision() {
  LOG_INFO("╔════════════════════════════════════════╗");
  LOG_INFO("║  HTTP POST /provision                 ║");
  LOG_INFO("╚════════════════════════════════════════╝");
  
  // Check state
  if (state_ != PROVISION_AP_MODE && state_ != PROVISION_WAITING_CONFIG) {
    sendJsonError(400, "INVALID_STATE", "Not in provisioning mode");
    return;
  }
  
  // Read request body
  String body = server_->arg("plain");
  
  if (body.length() == 0) {
    sendJsonError(400, "EMPTY_BODY", "Request body is empty");
    return;
  }
  
  LOG_DEBUG("Request body length: " + String(body.length()) + " bytes");
  
  // Parse JSON
  DynamicJsonDocument doc(1024);
  DeserializationError error = deserializeJson(doc, body);
  
  if (error) {
    String error_msg = "JSON parse error: " + String(error.c_str());
    LOG_ERROR(error_msg);
    sendJsonError(400, "JSON_PARSE_ERROR", error_msg);
    return;
  }
  
  // Extract WiFi Config
  WiFiConfig config;
  config.ssid = doc["ssid"] | "";
  config.password = doc["password"] | "";
  config.server_address = doc["server_address"] | "";
  config.mqtt_port = doc["mqtt_port"] | 8883;
  config.mqtt_username = doc["mqtt_username"] | "";
  config.mqtt_password = doc["mqtt_password"] | "";
  config.configured = true;  // Mark as configured
  
  LOG_INFO("Received configuration:");
  LOG_INFO("  SSID: " + config.ssid);
  LOG_INFO("  Password: " + String(config.password.length() > 0 ? "***" : "(empty)"));
  LOG_INFO("  Server: " + config.server_address);
  LOG_INFO("  MQTT Port: " + String(config.mqtt_port));
  LOG_INFO("  MQTT Username: " + (config.mqtt_username.length() > 0 ? config.mqtt_username : "(anonymous)"));
  
  // Validate config
  String validation_error = validateProvisionConfig(config);
  if (validation_error.length() > 0) {
    LOG_ERROR("Validation failed: " + validation_error);
    sendJsonError(400, "VALIDATION_FAILED", validation_error);
    return;
  }
  
  // Save WiFi Config to NVS
  if (!configManager.saveWiFiConfig(config)) {
    LOG_ERROR("Failed to save WiFi config to NVS");
    sendJsonError(500, "NVS_WRITE_FAILED", "Failed to save configuration to NVS");
    return;
  }
  
  LOG_INFO("✅ WiFi configuration saved to NVS");
  
  // Extract and save Zone Config (optional)
  if (doc.containsKey("kaiser_id") || doc.containsKey("master_zone_id")) {
    KaiserZone kaiser = configManager.getKaiser();
    MasterZone master = configManager.getMasterZone();
    
    if (doc.containsKey("kaiser_id")) {
      kaiser.kaiser_id = doc["kaiser_id"].as<String>();
      LOG_INFO("  Kaiser ID: " + kaiser.kaiser_id);
    }
    
    if (doc.containsKey("master_zone_id")) {
      master.master_zone_id = doc["master_zone_id"].as<String>();
      LOG_INFO("  Master Zone ID: " + master.master_zone_id);
    }
    
    if (configManager.saveZoneConfig(kaiser, master)) {
      LOG_INFO("✅ Zone configuration saved to NVS");
    } else {
      LOG_WARNING("⚠️ Failed to save zone configuration (non-critical)");
    }
  }
  
  // Success response
  DynamicJsonDocument response(256);
  response["success"] = true;
  response["message"] = "Configuration saved successfully. Rebooting in " + String(REBOOT_DELAY_MS / 1000) + " seconds...";
  response["esp_id"] = esp_id_;
  response["timestamp"] = millis();
  
  String response_str;
  serializeJson(response, response_str);
  
  server_->send(200, "application/json", response_str);
  
  // Update state
  config_received_ = true;
  transitionTo(PROVISION_CONFIG_RECEIVED);
  
  LOG_INFO("╔════════════════════════════════════════╗");
  LOG_INFO("║  ✅ PROVISIONING SUCCESSFUL           ║");
  LOG_INFO("╚════════════════════════════════════════╝");
  LOG_INFO("Rebooting in " + String(REBOOT_DELAY_MS / 1000) + " seconds...");
  
  // Delay before reboot (allow HTTP response to be sent)
  delay(REBOOT_DELAY_MS);
  
  // Reboot ESP
  ESP.restart();
}

void ProvisionManager::handleStatus() {
  LOG_DEBUG("HTTP GET /status");
  
  DynamicJsonDocument doc(512);
  
  doc["esp_id"] = esp_id_;
  doc["chip_model"] = ESP.getChipModel();
  doc["mac_address"] = WiFi.macAddress();
  doc["firmware_version"] = "4.0.0";  // TODO: From build config
  doc["state"] = getStateString();
  doc["uptime_seconds"] = getUptimeSeconds();
  doc["heap_free"] = ESP.getFreeHeap();
  doc["heap_min_free"] = ESP.getMinFreeHeap();
  doc["heap_size"] = ESP.getHeapSize();
  doc["provisioned"] = config_received_;
  doc["ap_start_time"] = ap_start_time_;
  doc["retry_count"] = retry_count_;
  
  String response;
  serializeJson(doc, response);
  
  server_->send(200, "application/json", response);
}

void ProvisionManager::handleReset() {
  LOG_WARNING("╔════════════════════════════════════════╗");
  LOG_WARNING("║  HTTP POST /reset                     ║");
  LOG_WARNING("║  FACTORY RESET REQUESTED              ║");
  LOG_WARNING("╚════════════════════════════════════════╝");
  
  // Parse request
  String body = server_->arg("plain");
  DynamicJsonDocument doc(256);
  deserializeJson(doc, body);
  
  // Check confirmation
  bool confirm = doc["confirm"] | false;
  if (!confirm) {
    sendJsonError(400, "CONFIRM_REQUIRED", "Set 'confirm':true to proceed with factory reset");
    return;
  }
  
  LOG_WARNING("Confirmation received - proceeding with factory reset");
  
  // Clear WiFi config
  configManager.resetWiFiConfig();
  LOG_INFO("✅ WiFi configuration cleared");
  
  // Clear zone config
  KaiserZone kaiser;
  MasterZone master;
  configManager.saveZoneConfig(kaiser, master);
  LOG_INFO("✅ Zone configuration cleared");
  
  // Success response
  DynamicJsonDocument response(256);
  response["success"] = true;
  response["message"] = "Factory reset completed. Rebooting in 3 seconds...";
  
  String response_str;
  serializeJson(response, response_str);
  
  server_->send(200, "application/json", response_str);
  
  LOG_INFO("╔════════════════════════════════════════╗");
  LOG_INFO("║  ✅ FACTORY RESET COMPLETE            ║");
  LOG_INFO("╚════════════════════════════════════════╝");
  LOG_INFO("Rebooting in 3 seconds...");
  
  // Delay before reboot
  delay(3000);
  
  // Reboot ESP
  ESP.restart();
}

void ProvisionManager::handleNotFound() {
  LOG_DEBUG("HTTP 404: " + server_->uri());
  
  DynamicJsonDocument doc(256);
  doc["success"] = false;
  doc["error"] = "NOT_FOUND";
  doc["message"] = "Endpoint not found: " + server_->uri();
  doc["available_endpoints"] = "GET /, POST /provision, GET /status, POST /reset";
  
  String response;
  serializeJson(doc, response);
  
  server_->send(404, "application/json", response);
}

// ============================================
// HELPER FUNCTIONS
// ============================================
String ProvisionManager::validateProvisionConfig(const WiFiConfig& config) const {
  // SSID Validation
  if (config.ssid.length() == 0) {
    return "WiFi SSID is empty";
  }
  if (config.ssid.length() > 32) {
    return "WiFi SSID too long (max 32 characters)";
  }
  
  // Password Validation
  if (config.password.length() > 63) {
    return "WiFi password too long (max 63 characters)";
  }
  
  // Server Address Validation
  if (config.server_address.length() == 0) {
    return "Server address is empty";
  }
  if (!validateIPv4(config.server_address)) {
    return "Server address is not a valid IPv4 address";
  }
  
  // MQTT Port Validation
  if (config.mqtt_port == 0 || config.mqtt_port > 65535) {
    return "MQTT port out of range (1-65535)";
  }
  
  return "";  // No errors
}

bool ProvisionManager::validateIPv4(const String& ip) const {
  int parts[4];
  int part_count = 0;
  int current_part = 0;
  
  for (size_t i = 0; i < ip.length(); i++) {
    char c = ip[i];
    if (c >= '0' && c <= '9') {
      current_part = current_part * 10 + (c - '0');
      if (current_part > 255) {
        return false;
      }
    } else if (c == '.') {
      if (part_count >= 4) {
        return false;
      }
      parts[part_count++] = current_part;
      current_part = 0;
    } else {
      return false;  // Invalid character
    }
  }
  
  // Add last part
  if (part_count >= 4) {
    return false;
  }
  parts[part_count++] = current_part;
  
  // Must have exactly 4 parts
  return part_count == 4;
}

void ProvisionManager::sendJsonError(int status_code, const String& error_code, const String& message) {
  LOG_ERROR("HTTP Error " + String(status_code) + ": " + error_code + " - " + message);
  
  DynamicJsonDocument doc(256);
  doc["success"] = false;
  doc["error"] = error_code;
  doc["message"] = message;
  
  String response;
  serializeJson(doc, response);
  
  server_->send(status_code, "application/json", response);
}

void ProvisionManager::sendJsonSuccess(const String& message) {
  DynamicJsonDocument doc(256);
  doc["success"] = true;
  doc["message"] = message;

  String response;
  serializeJson(doc, response);

  server_->send(200, "application/json", response);
}

unsigned long ProvisionManager::getUptimeSeconds() const {
  return millis() / 1000;
}

