// ============================================
// INCLUDES
// ============================================
#include <Arduino.h>
#include <ArduinoJson.h>
#include <esp_task_wdt.h>
#include "drivers/gpio_manager.h"
#include "utils/logger.h"
#include "services/config/storage_manager.h"
#include "services/config/config_manager.h"
#include "services/config/config_response.h"
#include "error_handling/error_tracker.h"
#include "error_handling/health_monitor.h"
#include "models/config_types.h"
#include "models/error_codes.h"
#include "utils/topic_builder.h"
#include "utils/json_helpers.h"
#include "models/system_types.h"
#include "models/watchdog_types.h"
#include "services/communication/wifi_manager.h"
#include "services/communication/mqtt_client.h"

// Phase 3: Hardware Abstraction Layer
#include "drivers/i2c_bus.h"
#include "drivers/onewire_bus.h"
#include "drivers/pwm_controller.h"

// OneWire utilities for ROM-Code conversion (Phase 4: OneWire-Scan)
#include "utils/onewire_utils.h"

// ============================================
// CONDITIONAL HARDWARE CONFIGURATION INCLUDES
// ============================================
// Phase 4: Required for DEFAULT_ONEWIRE_PIN in OneWire-Scan command
#ifdef XIAO_ESP32C3
    #include "config/hardware/xiao_esp32c3.h"
#else
    #include "config/hardware/esp32_dev.h"
#endif

// Phase 4: Sensor System
#include "services/sensor/sensor_manager.h"
#include "models/sensor_types.h"

// Phase 5: Actuator System
#include "services/actuator/actuator_manager.h"
#include "services/actuator/safety_controller.h"

// Phase 6: Provisioning System
#include "services/provisioning/provision_manager.h"

// Phase 8: NTP Time Management
#include "utils/time_manager.h"

// ESP-IDF TAG convention for structured logging
static const char* TAG = "BOOT";

// ============================================
// CONSTANTS
// ============================================
// ✅ FIX #3+#4: LED pin for hardware safe-mode feedback
const uint8_t LED_PIN = 2;  // ESP32 onboard LED (GPIO2)

// ============================================
// GLOBAL VARIABLES
// ============================================
SystemConfig g_system_config;
WiFiConfig g_wifi_config;
KaiserZone g_kaiser;
MasterZone g_master;

// ============================================
// WATCHDOG GLOBALS (Industrial-Grade)
// ============================================
WatchdogConfig g_watchdog_config;
WatchdogDiagnostics g_watchdog_diagnostics;
volatile bool g_watchdog_timeout_flag = false;

// ============================================
// FORWARD DECLARATIONS
// ============================================
void handleSensorConfig(const String& payload);
bool parseAndConfigureSensor(const JsonObjectConst& sensor_obj);
// Phase 4: Version with failure output parameter for aggregated error reporting
bool parseAndConfigureSensorWithTracking(const JsonObjectConst& sensor_obj, ConfigFailureItem* failure_out);
void handleActuatorConfig(const String& payload);
void handleSensorCommand(const String& topic, const String& payload);  // Phase 2C

// ============================================
// HELPER FUNCTIONS
// ============================================

// Helper: ErrorTracker MQTT Publish Callback (Observability - Phase 1-3)
// Fire-and-forget - no error handling to prevent recursion
void errorTrackerMqttCallback(const char* topic, const char* payload) {
  if (mqttClient.isConnected()) {
    mqttClient.publish(topic, payload, 0);  // QoS 0 = fire-and-forget
  }
}

// Helper: Send Subzone ACK
void sendSubzoneAck(const String& subzone_id, const String& status, const String& error_message) {
  String ack_topic = TopicBuilder::buildSubzoneAckTopic();
  DynamicJsonDocument ack_doc(512);
  ack_doc["esp_id"] = g_system_config.esp_id;
  ack_doc["status"] = status;
  ack_doc["subzone_id"] = subzone_id;
  ack_doc["timestamp"] = millis() / 1000;

  if (status == "error" && error_message.length() > 0) {
    ack_doc["error_code"] = ERROR_SUBZONE_CONFIG_SAVE_FAILED;
    ack_doc["message"] = error_message;
  }

  ack_doc["seq"] = mqttClient.getNextSeq();

  String ack_payload;
  size_t written = serializeJson(ack_doc, ack_payload);
  if (written == 0 || ack_payload.length() == 0) {
    LOG_E(TAG, "JSON serialization failed for Subzone ACK: " + subzone_id);
    // Fallback: Send minimal ACK with required fields
    ack_payload = "{\"esp_id\":\"" + g_system_config.esp_id +
                 "\",\"status\":\"error\",\"subzone_id\":\"" + subzone_id +
                 "\",\"message\":\"serialization_failed\",\"timestamp\":0}";
  }
  mqttClient.publish(ack_topic, ack_payload, 1);
}

// ============================================
// SETUP - INITIALIZATION ORDER (Guide-konform)
// ============================================
void setup() {
  // ============================================
  // STEP 1: HARDWARE INITIALIZATION
  // ============================================
  Serial.begin(115200);

  // NOTE: Wokwi simulation needs longer delay for virtual UART initialization
  // On real hardware 100ms is sufficient, but Wokwi's virtual serial is slower
  #ifdef WOKWI_SIMULATION
  delay(500);  // Wokwi needs more time for UART
  Serial.println("[WOKWI] Serial initialized - simulation mode active");
  Serial.flush();  // Ensure output is sent before continuing
  delay(100);
  #else
  delay(100);  // Allow Serial to stabilize on real hardware
  #endif

  // ============================================
  // STEP 2: BOOT BANNER (before Logger exists)
  // ============================================
  Serial.println("\n╔════════════════════════════════════════╗");
  Serial.println("║  ESP32 Sensor Network v4.0 (Phase 2)  ║");
  Serial.println("╚════════════════════════════════════════╝");
  Serial.printf("Chip Model: %s\n", ESP.getChipModel());
  Serial.printf("CPU Frequency: %d MHz\n", ESP.getCpuFreqMHz());
  Serial.printf("Free Heap: %d bytes\n\n", ESP.getFreeHeap());

  // ============================================
  // STEP 2.3: WATCHDOG CONFIGURATION (INDUSTRIAL-GRADE)
  // ============================================
  // Watchdog initialization is CONDITIONAL based on provisioning status
  // See STEP 6.5 below for conditional watchdog initialization
  //
  // NOTE: Skipped in Wokwi simulation because:
  // - esp_task_wdt_* functions may not be fully supported in Wokwi's virtual environment
  // - Watchdog behavior in simulation differs from real hardware
  // - Avoids potential early crash before any serial output
  #ifdef WOKWI_SIMULATION
  Serial.println("[WOKWI] Watchdog skipped (not supported in simulation)");
  g_watchdog_config.mode = WatchdogMode::WDT_DISABLED;
  #endif

  // ============================================
  // STEP 2.5: BOOT-BUTTON FACTORY RESET CHECK (Before GPIO init!)
  // ============================================
  // Check if Boot button (GPIO 0) is pressed for Factory Reset
  // This MUST be before gpioManager.initializeAllPinsToSafeMode()
  //
  // NOTE: Skipped in Wokwi simulation because:
  // - GPIO 0 is not connected to a physical button in diagram.json
  // - GPIO 0 may float LOW in simulation, triggering false factory resets
  // - Factory reset is not meaningful in CI/CD environment
  #ifndef WOKWI_SIMULATION
  const uint8_t BOOT_BUTTON_PIN = 0;  // GPIO 0 on ESP32
  const unsigned long HOLD_TIME_MS = 10000;  // 10 seconds

  pinMode(BOOT_BUTTON_PIN, INPUT_PULLUP);

  if (digitalRead(BOOT_BUTTON_PIN) == LOW) {
    Serial.println("╔════════════════════════════════════════╗");
    Serial.println("║  ⚠️  BOOT BUTTON PRESSED              ║");
    Serial.println("║  Hold for 10 seconds for Factory Reset║");
    Serial.println("╚════════════════════════════════════════╝");

    unsigned long start_time = millis();
    bool held_for_10s = true;
    uint8_t last_second = 0;

    while (millis() - start_time < HOLD_TIME_MS) {
      if (digitalRead(BOOT_BUTTON_PIN) == HIGH) {
        held_for_10s = false;
        Serial.println("\nButton released - Factory Reset cancelled");
        break;
      }

      // Progress indicator (every second)
      uint8_t current_second = (millis() - start_time) / 1000;
      if (current_second > last_second) {
        Serial.print(".");
        last_second = current_second;
      }

      delay(100);
    }

    if (held_for_10s) {
      Serial.println("\n╔════════════════════════════════════════╗");
      Serial.println("║  🔥 FACTORY RESET TRIGGERED           ║");
      Serial.println("╚════════════════════════════════════════╝");

      // Initialize minimal systems for NVS access
      storageManager.begin();
      configManager.begin();

      // Clear WiFi config
      configManager.resetWiFiConfig();
      Serial.println("✅ WiFi configuration cleared");

      // Clear zone config
      KaiserZone kaiser;
      MasterZone master;
      configManager.saveZoneConfig(kaiser, master);
      Serial.println("✅ Zone configuration cleared");

      Serial.println("\n╔════════════════════════════════════════╗");
      Serial.println("║  ✅ FACTORY RESET COMPLETE            ║");
      Serial.println("╚════════════════════════════════════════╝");
      Serial.println("Rebooting in 2 seconds...");
      delay(2000);
      ESP.restart();
    }
  }
  #else
  // Wokwi simulation: Skip boot button check, log for debugging
  Serial.println("[WOKWI] Boot button check skipped (no physical button in simulation)");
  #endif // WOKWI_SIMULATION

  // ============================================
  // STEP 3: GPIO SAFE-MODE (CRITICAL - FIRST!)
  // ============================================
  // MUST be first to prevent hardware damage from undefined GPIO states
  gpioManager.initializeAllPinsToSafeMode();

  // ============================================
  // STEP 4: LOGGER (Foundation for all modules)
  // ============================================
  logger.begin();
  logger.setLogLevel(LOG_INFO);
  LOG_I(TAG, "Logger system initialized");

  // ============================================
  // STEP 5: STORAGE MANAGER (NVS access layer)
  // ============================================
  if (!storageManager.begin()) {
    LOG_E(TAG, "StorageManager initialization failed!");
    // Continue anyway (can work without persistence)
  }

  // ============================================
  // STEP 5.1: RESTORE LOG LEVEL FROM NVS
  // ============================================
  // Log-Level persists across reboots (set via MQTT set_log_level command)
  if (storageManager.beginNamespace("system_config", true)) {
    uint8_t saved_level = storageManager.getUInt8("log_level", LOG_INFO);
    if (saved_level <= LOG_CRITICAL) {
      logger.setLogLevel((LogLevel)saved_level);
      // Use Serial.printf directly — LOG_INFO would be invisible if restored level > INFO
      Serial.printf("[NVS] Log level restored from NVS: %s\n", Logger::getLogLevelString((LogLevel)saved_level));
    }
    storageManager.endNamespace();
  }

  // ============================================
  // STEP 6: CONFIG MANAGER (Load configurations)
  // ============================================
  configManager.begin();
  if (!configManager.loadAllConfigs()) {
    LOG_W(TAG, "Some configurations failed to load - using defaults");
  }

  // Load configs into global variables
  configManager.loadWiFiConfig(g_wifi_config);
  configManager.loadZoneConfig(g_kaiser, g_master);
  configManager.loadSystemConfig(g_system_config);

  // ============================================
  // FIX: Use generated ESP ID when NVS read returns empty
  // In WOKWI mode, saveSystemConfig() is a no-op so the ESP ID
  // generated by generateESPIdIfMissing() never reaches NVS.
  // Fallback to the internal configManager state which already has it.
  // ============================================
  if (g_system_config.esp_id.length() == 0) {
    g_system_config.esp_id = configManager.getESPId();
    LOG_W(TAG, "ESP ID was empty after NVS load - using generated: " + g_system_config.esp_id);
  }

  configManager.printConfigurationStatus();

  // ═══════════════════════════════════════════════════════════════════════════
  // DEFENSIVE FIX: Detect and repair inconsistent state after provisioning
  // ═══════════════════════════════════════════════════════════════════════════
  // Problem: If STATE_SAFE_MODE_PROVISIONING is persisted but valid WiFi config
  // exists, ESP enters infinite reboot loop. This can happen if:
  //   1. Power loss during state transition
  //   2. Bug in provisioning flow (now fixed in provision_manager.cpp)
  //   3. Manual NVS manipulation
  //
  // Solution: If we have valid config but are in provisioning safe-mode,
  // reset state and attempt normal WiFi connection.
  // ═══════════════════════════════════════════════════════════════════════════
  if (g_system_config.current_state == STATE_SAFE_MODE_PROVISIONING &&
      g_wifi_config.configured &&
      g_wifi_config.ssid.length() > 0) {
    LOG_W(TAG, "╔════════════════════════════════════════╗");
    LOG_W(TAG, "║  INCONSISTENT STATE DETECTED          ║");
    LOG_W(TAG, "╚════════════════════════════════════════╝");
    LOG_W(TAG, "State: STATE_SAFE_MODE_PROVISIONING but valid config exists");
    LOG_W(TAG, "SSID: " + g_wifi_config.ssid);
    LOG_W(TAG, "Repairing: Resetting state to STATE_BOOT");

    g_system_config.current_state = STATE_BOOT;
    g_system_config.safe_mode_reason = "";
    g_system_config.boot_count = 0;  // Reset boot counter to prevent false boot-loop detection
    configManager.saveSystemConfig(g_system_config);

    LOG_I(TAG, "State repaired - proceeding with normal boot flow");
  }

  // ═══════════════════════════════════════════════════
  // PHASE 2: BOOT-LOOP-DETECTION (Robustness + Overflow-Safe)
  // ═══════════════════════════════════════════════════
  // Calculate time since last boot (handles millis() overflow after 49.7 days)
  unsigned long now = millis();
  unsigned long time_since_last_boot = 0;

  if (g_system_config.last_boot_time > 0) {
    // Handle millis() overflow gracefully
    if (now >= g_system_config.last_boot_time) {
      time_since_last_boot = now - g_system_config.last_boot_time;
    } else {
      // Overflow occurred - treat as > 60s (boot is valid)
      time_since_last_boot = 60001;
    }
  } else {
    // First boot ever - treat as > 60s (boot is valid)
    time_since_last_boot = 60001;
  }

  // Increment boot counter and update timestamp
  g_system_config.boot_count++;
  g_system_config.last_boot_time = now;
  configManager.saveSystemConfig(g_system_config);

  LOG_I(TAG, "Boot count: " + String(g_system_config.boot_count) +
           " (last boot " + String(time_since_last_boot / 1000) + "s ago)");

  // Boot-Loop-Detection: 5 boots in <60s triggers Safe-Mode
  if (g_system_config.boot_count > 5 && time_since_last_boot < 60000) {
    LOG_C(TAG, "╔════════════════════════════════════════╗");
    LOG_C(TAG, "║  BOOT LOOP DETECTED - SAFE MODE       ║");
    LOG_C(TAG, "╚════════════════════════════════════════╝");
    LOG_C(TAG, "Booted " + String(g_system_config.boot_count) + " times in <60s");
    LOG_C(TAG, "System entering Safe-Mode (no WiFi/MQTT)");
    LOG_C(TAG, "Reset required to exit Safe-Mode");

    // Enter Safe-Mode: Disable WiFi/MQTT, only Serial log available
    g_system_config.current_state = STATE_SAFE_MODE;
    g_system_config.safe_mode_reason = "Boot loop detected (" + String(g_system_config.boot_count) + " boots)";
    configManager.saveSystemConfig(g_system_config);

    // Infinite loop - only watchdog can reset
    while(true) {
      delay(1000);
      LOG_W(TAG, "SAFE MODE - Boot count: " + String(g_system_config.boot_count));
    }
  }

  // ═══════════════════════════════════════════════════
  // STEP 6.5: CONDITIONAL WATCHDOG INITIALIZATION (Industrial-Grade)
  // ═══════════════════════════════════════════════════
  // Check if provisioning needed BEFORE watchdog init
  bool provisioning_needed = !g_wifi_config.configured ||
                             g_wifi_config.ssid.length() == 0;

  #ifndef WOKWI_SIMULATION
  if (provisioning_needed) {
    // PROVISIONING MODE WATCHDOG
    LOG_I(TAG, "╔════════════════════════════════════════╗");
    LOG_I(TAG, "║   PROVISIONING MODE WATCHDOG          ║");
    LOG_I(TAG, "╚════════════════════════════════════════╝");

    esp_task_wdt_init(300, false);  // 300s timeout, no panic
    esp_task_wdt_add(NULL);

    LOG_I(TAG, "✅ Watchdog: 300s timeout, error-log only");
    LOG_I(TAG, "   Feed requirement: Every 60s");
    LOG_I(TAG, "   Purpose: Detect firmware hangs during setup");
    LOG_I(TAG, "   Recovery: Manual reset button available");

    g_watchdog_config.mode = WatchdogMode::PROVISIONING;
    g_watchdog_config.timeout_ms = 300000;
    g_watchdog_config.feed_interval_ms = 60000;
    g_watchdog_config.panic_enabled = false;

  } else {
    // PRODUCTION MODE WATCHDOG
    LOG_I(TAG, "╔════════════════════════════════════════╗");
    LOG_I(TAG, "║   PRODUCTION MODE WATCHDOG            ║");
    LOG_I(TAG, "╚════════════════════════════════════════╝");

    esp_task_wdt_init(60, true);  // 60s timeout, panic=true
    esp_task_wdt_add(NULL);

    LOG_I(TAG, "✅ Watchdog: 60s timeout, auto-reboot enabled");
    LOG_I(TAG, "   Feed requirement: Every 10s");
    LOG_I(TAG, "   Purpose: Automatic recovery from firmware hangs");
    LOG_I(TAG, "   Recovery: Hard reset → clean boot");

    g_watchdog_config.mode = WatchdogMode::PRODUCTION;
    g_watchdog_config.timeout_ms = 60000;
    g_watchdog_config.feed_interval_ms = 10000;
    g_watchdog_config.panic_enabled = true;
  }
  #endif

  // Initialize watchdog diagnostics
  g_watchdog_diagnostics = WatchdogDiagnostics();
  g_watchdog_timeout_flag = false;

  // Check if last reboot was due to watchdog timeout
  if (esp_reset_reason() == ESP_RST_TASK_WDT) {
    LOG_W(TAG, "==============================================");
    LOG_W(TAG, "ESP REBOOTED DUE TO WATCHDOG TIMEOUT");
    LOG_W(TAG, "==============================================");

    // TODO: Load diagnostic info from NVS (after StorageManager integration)
    // WatchdogDiagnostics diag;
    // if (storageManager.loadWatchdogDiagnostics(diag)) {
    //   LOG_I(TAG, "Last Feed: " + String(diag.last_feed_component));
    //   LOG_I(TAG, "System State: " + String(diag.system_state));
    // }

    // Check: 3× Watchdog in 24h?
    uint8_t watchdog_count = getWatchdogCountLast24h();
    if (watchdog_count >= 3) {
      LOG_C(TAG, "3× Watchdog in 24h → SAFE MODE ACTIVATED");
      // TODO: Enter Safe-Mode (after Safe-Mode implementation)
      // enterSafeMode(SAFE_MODE_WATCHDOG_THRESHOLD);
    }
  }

  // ═══════════════════════════════════════════════════
  // STEP 6.6: PROVISIONING CHECK (Phase 6)
  // ═══════════════════════════════════════════════════
  // Check if ESP needs provisioning (no config or empty SSID)
  if (provisioning_needed) {
    LOG_I(TAG, "╔════════════════════════════════════════╗");
    LOG_I(TAG, "║   NO CONFIG - STARTING PROVISIONING   ║");
    LOG_I(TAG, "╚════════════════════════════════════════╝");
    LOG_I(TAG, "ESP is not provisioned. Starting AP-Mode...");

    // Initialize Provision Manager
    if (!provisionManager.begin()) {
      // ✅ FIX #3: CRITICAL FAILURE - Hardware Safe-Mode
      LOG_C(TAG, "╔════════════════════════════════════════╗");
      LOG_C(TAG, "║  ❌ PROVISION MANAGER INIT FAILED     ║");
      LOG_C(TAG, "╚════════════════════════════════════════╝");
      LOG_C(TAG, "ProvisionManager.begin() returned false");
      LOG_C(TAG, "Possible causes:");
      LOG_C(TAG, "  1. Storage/NVS initialization failed");
      LOG_C(TAG, "  2. Memory allocation failed");
      LOG_C(TAG, "  3. Hardware issue");
      LOG_C(TAG, "");
      LOG_C(TAG, "Entering HARDWARE SAFE-MODE (LED blink pattern)");
      LOG_C(TAG, "Action: Check hardware, flash firmware again");

      // ✅ Fallback: Continuous LED blink (industrial-grade feedback)
      pinMode(LED_PIN, OUTPUT);
      while (true) {
        // Blink pattern: 3× schnell (Error-Code)
        for (int i = 0; i < 3; i++) {
          digitalWrite(LED_PIN, HIGH);
          delay(200);
          digitalWrite(LED_PIN, LOW);
          delay(200);
        }
        delay(2000);  // Pause between patterns
      }
      // ❌ NIEMALS return - ESP bleibt im Safe-Mode sichtbar!
    }

    // Start AP-Mode
    if (provisionManager.startAPMode()) {
      LOG_I(TAG, "╔════════════════════════════════════════╗");
      LOG_I(TAG, "║  ACCESS POINT MODE ACTIVE             ║");
      LOG_I(TAG, "╚════════════════════════════════════════╝");
      LOG_I(TAG, "Connect to: AutoOne-" + g_system_config.esp_id);
      LOG_I(TAG, "Password: provision");
      LOG_I(TAG, "Open browser: http://192.168.4.1");
      LOG_I(TAG, "");
      LOG_I(TAG, "Waiting for configuration (timeout: 10 minutes)...");

      // Block until config received (or timeout: 10 minutes)
      if (provisionManager.waitForConfig(600000)) {
        // ✅ SUCCESS: Config received
        LOG_I(TAG, "╔════════════════════════════════════════╗");
        LOG_I(TAG, "║  ✅ PROVISIONING SUCCESSFUL           ║");
        LOG_I(TAG, "╚════════════════════════════════════════╝");
        LOG_I(TAG, "Configuration saved to NVS");
        LOG_I(TAG, "Rebooting in 2 seconds...");
        delay(2000);
        ESP.restart();  // Reboot to apply config
      } else {
        // ❌ TIMEOUT: No config received
        LOG_E(TAG, "╔════════════════════════════════════════╗");
        LOG_E(TAG, "║  ❌ PROVISIONING TIMEOUT              ║");
        LOG_E(TAG, "╚════════════════════════════════════════╝");
        LOG_E(TAG, "No configuration received within 10 minutes");
        LOG_E(TAG, "ESP will enter Safe-Mode with active Provisioning");
        LOG_E(TAG, "Please check:");
        LOG_E(TAG, "  1. WiFi connection to ESP AP");
        LOG_E(TAG, "  2. God-Kaiser server status");
        LOG_E(TAG, "  3. Network connectivity");

        // ✅ FIX #1: provision_manager.cpp hat bereits enterSafeMode() gecallt!
        // → STATE_SAFE_MODE_PROVISIONING ist gesetzt
        // → AP-Mode bleibt aktiv, HTTP-Server läuft weiter
        // → setup() darf NICHT abbrechen, damit loop() laufen kann
        LOG_I(TAG, "ProvisionManager.enterSafeMode() bereits ausgeführt");
        LOG_I(TAG, "State: STATE_SAFE_MODE_PROVISIONING");
        LOG_I(TAG, "AP-Mode bleibt aktiv - Warte auf Konfiguration...");

        // ✅ setup() läuft weiter OHNE WiFi/MQTT zu initialisieren
        // → loop() wird STATE_SAFE_MODE_PROVISIONING behandeln
      }
    } else {
      // ✅ FIX #4: CRITICAL FAILURE - Hardware Safe-Mode
      LOG_C(TAG, "╔════════════════════════════════════════╗");
      LOG_C(TAG, "║  ❌ AP-MODE START FAILED              ║");
      LOG_C(TAG, "╚════════════════════════════════════════╝");
      LOG_C(TAG, "ProvisionManager.startAPMode() returned false");
      LOG_C(TAG, "Possible causes:");
      LOG_C(TAG, "  1. WiFi hardware initialization failed");
      LOG_C(TAG, "  2. AP configuration invalid");
      LOG_C(TAG, "  3. Memory allocation failed");
      LOG_C(TAG, "  4. Hardware issue (WiFi chip)");
      LOG_C(TAG, "");
      LOG_C(TAG, "Entering HARDWARE SAFE-MODE (LED blink pattern)");
      LOG_C(TAG, "Action: Check hardware, flash firmware again");

      // ✅ Fallback: Continuous LED blink (industrial-grade feedback)
      pinMode(LED_PIN, OUTPUT);
      while (true) {
        // Blink pattern: 4× schnell (Error-Code für AP-Mode-Fehler)
        for (int i = 0; i < 4; i++) {
          digitalWrite(LED_PIN, HIGH);
          delay(200);
          digitalWrite(LED_PIN, LOW);
          delay(200);
        }
        delay(2000);  // Pause between patterns
      }
      // ❌ NIEMALS return - ESP bleibt im Safe-Mode sichtbar!
    }
  }

  // ═══════════════════════════════════════════════════
  // NORMAL FLOW: Config vorhanden
  // ═══════════════════════════════════════════════════

  // ✅ FIX #1: Skip WiFi/MQTT initialization when in provisioning safe-mode
  if (g_system_config.current_state == STATE_SAFE_MODE_PROVISIONING) {
    LOG_I(TAG, "╔════════════════════════════════════════╗");
    LOG_I(TAG, "║  STATE_SAFE_MODE_PROVISIONING         ║");
    LOG_I(TAG, "╚════════════════════════════════════════╝");
    LOG_I(TAG, "Skipping WiFi/MQTT initialization");
    LOG_I(TAG, "AP-Mode bleibt aktiv - HTTP-Server läuft");
    LOG_I(TAG, "Warte auf Konfiguration via Provisioning-API...");
    LOG_I(TAG, "setup() abgeschlossen - loop() wird provisionManager.loop() ausführen");
    return;  // ✅ ERLAUBT: setup() endet, aber loop() wird aufgerufen!
  }

  LOG_I(TAG, "Configuration found - starting normal flow");

  // ============================================
  // STEP 7: ERROR TRACKER (Error history)
  // ============================================
  errorTracker.begin();

  // ============================================
  // STEP 8: TOPIC BUILDER (MQTT topics)
  // ============================================
  TopicBuilder::setEspId(g_system_config.esp_id.c_str());
  TopicBuilder::setKaiserId(g_kaiser.kaiser_id.c_str());

  LOG_I(TAG, "TopicBuilder configured with ESP ID: " + g_system_config.esp_id);

  // ============================================
  // STEP 9: PHASE 1 COMPLETE
  // ============================================
  LOG_I(TAG, "╔════════════════════════════════════════╗");
  LOG_I(TAG, "║   Phase 1: Core Infrastructure READY  ║");
  LOG_I(TAG, "╚════════════════════════════════════════╝");
  LOG_I(TAG, "Modules Initialized:");
  LOG_I(TAG, "  ✅ GPIO Manager (Safe-Mode)");
  LOG_I(TAG, "  ✅ Logger System");
  LOG_I(TAG, "  ✅ Storage Manager");
  LOG_I(TAG, "  ✅ Config Manager");
  LOG_I(TAG, "  ✅ Error Tracker");
  LOG_I(TAG, "  ✅ Topic Builder");

  // Print memory stats
  LOG_I(TAG, "=== Memory Status (Phase 1) ===");
  LOG_I(TAG, "Free Heap: " + String(ESP.getFreeHeap()) + " bytes");
  LOG_I(TAG, "Min Free Heap: " + String(ESP.getMinFreeHeap()) + " bytes");
  LOG_I(TAG, "Heap Size: " + String(ESP.getHeapSize()) + " bytes");
  LOG_I(TAG, "=====================");

  // ============================================
  // STEP 10: PHASE 2 - COMMUNICATION LAYER (with Circuit Breaker - Phase 6+)
  // ============================================
  LOG_I(TAG, "╔════════════════════════════════════════╗");
  LOG_I(TAG, "║   Phase 2: Communication Layer         ║");
  LOG_I(TAG, "║   (with Circuit Breaker Protection)    ║");
  LOG_I(TAG, "╚════════════════════════════════════════╝");

  // WiFi Manager (Circuit Breaker: 10 failures → 60s timeout)
  if (!wifiManager.begin()) {
    LOG_E(TAG, "WiFiManager initialization failed!");
    return;
  }

  WiFiConfig wifi_config = configManager.getWiFiConfig();
  if (!wifiManager.connect(wifi_config)) {
    LOG_E(TAG, "WiFi connection failed");

    // ═══════════════════════════════════════════════════
    // NEW: WiFi failure triggers Provisioning Portal
    // ═══════════════════════════════════════════════════
    LOG_C(TAG, "╔════════════════════════════════════════╗");
    LOG_C(TAG, "║  WIFI CONNECTION FAILED               ║");
    LOG_C(TAG, "║  Opening Provisioning Portal...       ║");
    LOG_C(TAG, "╚════════════════════════════════════════╝");

    // Update system state
    g_system_config.current_state = STATE_SAFE_MODE_PROVISIONING;
    g_system_config.safe_mode_reason = "WiFi connection to '" + wifi_config.ssid + "' failed";
    configManager.saveSystemConfig(g_system_config);

    // Initialize and start Provisioning Manager
    if (!provisionManager.begin()) {
      LOG_C(TAG, "ProvisionManager initialization failed!");
      // LED blink pattern for hardware failure
      pinMode(LED_PIN, OUTPUT);
      while (true) {
        for (int i = 0; i < 5; i++) {
          digitalWrite(LED_PIN, HIGH);
          delay(200);
          digitalWrite(LED_PIN, LOW);
          delay(200);
        }
        delay(2000);
      }
    }

    if (provisionManager.startAPMode()) {
      LOG_I(TAG, "╔════════════════════════════════════════╗");
      LOG_I(TAG, "║  PROVISIONING PORTAL ACTIVE           ║");
      LOG_I(TAG, "╚════════════════════════════════════════╝");
      LOG_I(TAG, "Connect to: AutoOne-" + g_system_config.esp_id);
      LOG_I(TAG, "Password: provision");
      LOG_I(TAG, "Open browser: http://192.168.4.1");
      LOG_I(TAG, "");
      LOG_I(TAG, "Correct your WiFi credentials in the form.");
      LOG_I(TAG, "setup() complete - loop() will handle provisioning");
      return;  // Exit setup() early - loop() will handle provisioning
    } else {
      LOG_C(TAG, "Failed to start AP Mode!");
      // LED blink pattern for AP failure
      pinMode(LED_PIN, OUTPUT);
      while (true) {
        for (int i = 0; i < 4; i++) {
          digitalWrite(LED_PIN, HIGH);
          delay(200);
          digitalWrite(LED_PIN, LOW);
          delay(200);
        }
        delay(2000);
      }
    }
  } else {
    LOG_I(TAG, "WiFi connected successfully");
  }

  // MQTT Client (Circuit Breaker: 5 failures → 30s timeout)
  if (!mqttClient.begin()) {
    LOG_E(TAG, "MQTTClient initialization failed!");
    return;
  }

  MQTTConfig mqtt_config;
  mqtt_config.server = wifi_config.server_address;
  mqtt_config.port = wifi_config.mqtt_port;
  mqtt_config.client_id = configManager.getESPId();
  mqtt_config.username = wifi_config.mqtt_username;  // Can be empty (Anonymous)
  mqtt_config.password = wifi_config.mqtt_password;  // Can be empty (Anonymous)
  mqtt_config.keepalive = 60;
  mqtt_config.timeout = 10;

  if (!mqttClient.connect(mqtt_config)) {
    LOG_E(TAG, "MQTT connection failed");

    // ═══════════════════════════════════════════════════
    // MQTT FAILURE → PROVISIONING PORTAL RECOVERY
    // ═══════════════════════════════════════════════════
    // Same pattern as WiFi failure recovery (see STEP 10 above).
    // If MQTT broker is unreachable, the server IP or MQTT port
    // in the user's config is likely wrong. Re-open the portal
    // so the user can correct the configuration.
    LOG_C(TAG, "╔════════════════════════════════════════╗");
    LOG_C(TAG, "║  MQTT CONNECTION FAILED                ║");
    LOG_C(TAG, "║  Opening Provisioning Portal...        ║");
    LOG_C(TAG, "╚════════════════════════════════════════╝");
    LOG_C(TAG, "Server: " + mqtt_config.server + ":" + String(mqtt_config.port));
    LOG_C(TAG, "Possible causes:");
    LOG_C(TAG, "  1. Wrong MQTT port in configuration");
    LOG_C(TAG, "  2. Server IP not reachable");
    LOG_C(TAG, "  3. MQTT broker not running");

    // Update system state
    g_system_config.current_state = STATE_SAFE_MODE_PROVISIONING;
    g_system_config.safe_mode_reason = "MQTT connection to '" + mqtt_config.server +
                                       ":" + String(mqtt_config.port) + "' failed";
    configManager.saveSystemConfig(g_system_config);

    // Clear the faulty config so the user must re-enter it
    configManager.resetWiFiConfig();
    LOG_I(TAG, "WiFi/MQTT configuration cleared from NVS");

    // Initialize and start Provisioning Manager
    if (!provisionManager.begin()) {
      LOG_C(TAG, "ProvisionManager initialization failed!");
      pinMode(LED_PIN, OUTPUT);
      while (true) {
        for (int i = 0; i < 6; i++) {  // 6x blink = MQTT failure code
          digitalWrite(LED_PIN, HIGH);
          delay(200);
          digitalWrite(LED_PIN, LOW);
          delay(200);
        }
        delay(2000);
      }
    }

    if (provisionManager.startAPMode()) {
      LOG_I(TAG, "╔════════════════════════════════════════╗");
      LOG_I(TAG, "║  PROVISIONING PORTAL ACTIVE            ║");
      LOG_I(TAG, "╚════════════════════════════════════════╝");
      LOG_I(TAG, "Connect to: AutoOne-" + g_system_config.esp_id);
      LOG_I(TAG, "Password: provision");
      LOG_I(TAG, "Open browser: http://192.168.4.1");
      LOG_I(TAG, "");
      LOG_I(TAG, "Correct your Server IP / MQTT Port in the form.");
      LOG_I(TAG, "setup() complete - loop() will handle provisioning");
      return;  // Exit setup() early - loop() will handle provisioning
    } else {
      LOG_C(TAG, "Failed to start AP Mode after MQTT failure!");
      pinMode(LED_PIN, OUTPUT);
      while (true) {
        for (int i = 0; i < 4; i++) {
          digitalWrite(LED_PIN, HIGH);
          delay(200);
          digitalWrite(LED_PIN, LOW);
          delay(200);
        }
        delay(2000);
      }
    }
  } else {
    LOG_I(TAG, "MQTT connected successfully");

    // ============================================
    // ENABLE ERRORTRACKER MQTT PUBLISHING (Observability)
    // ============================================
    // Now that MQTT is connected, enable error publishing to server
    errorTracker.setMqttPublishCallback(errorTrackerMqttCallback, g_system_config.esp_id);
    LOG_I(TAG, "ErrorTracker MQTT publishing enabled");

    // Phase 7: Send initial heartbeat for ESP discovery/registration
    // force=true bypasses throttle check (fix for initial heartbeat being blocked)
    mqttClient.publishHeartbeat(true);
    LOG_I(TAG, "Initial heartbeat sent for ESP registration");

    // Subscribe to critical topics
    String system_command_topic = TopicBuilder::buildSystemCommandTopic();
    String config_topic = TopicBuilder::buildConfigTopic();
    String broadcast_emergency_topic = TopicBuilder::buildBroadcastEmergencyTopic();
    String actuator_command_topic = TopicBuilder::buildActuatorCommandTopic(0);
    String actuator_command_wildcard = actuator_command_topic;
    actuator_command_wildcard.replace("/0/command", "/+/command");
    String esp_emergency_topic = TopicBuilder::buildActuatorEmergencyTopic();

    // WP3: Use TopicBuilder for zone topics
    String zone_assign_topic = TopicBuilder::buildZoneAssignTopic();

    mqttClient.subscribe(system_command_topic);
    mqttClient.subscribe(config_topic);
    mqttClient.subscribe(broadcast_emergency_topic);
    mqttClient.subscribe(actuator_command_wildcard);
    mqttClient.subscribe(esp_emergency_topic);
    mqttClient.subscribe(zone_assign_topic);

    // Phase 9: Subzone management topics
    String subzone_assign_topic = TopicBuilder::buildSubzoneAssignTopic();
    String subzone_remove_topic = TopicBuilder::buildSubzoneRemoveTopic();
    String subzone_safe_topic = TopicBuilder::buildSubzoneSafeTopic();
    mqttClient.subscribe(subzone_assign_topic);
    mqttClient.subscribe(subzone_remove_topic);
    mqttClient.subscribe(subzone_safe_topic);

    // WP3: Build sensor command wildcard from TopicBuilder
    // Wildcard subscription for all sensor GPIOs: kaiser/{id}/esp/{esp_id}/sensor/+/command
    String sensor_command_wildcard = String(TopicBuilder::buildSensorCommandTopic(0));
    sensor_command_wildcard.replace("/0/command", "/+/command");
    mqttClient.subscribe(sensor_command_wildcard);

    // Phase 2: Heartbeat-ACK topic (Server → ESP for approval status)
    String heartbeat_ack_topic = TopicBuilder::buildSystemHeartbeatAckTopic();
    mqttClient.subscribe(heartbeat_ack_topic);

    LOG_I(TAG, "Subscribed to system + actuator + zone + subzone + sensor + heartbeat-ack topics");

    // Set MQTT callback for message routing (Phase 4)
    mqttClient.setCallback([](const String& topic, const String& payload) {
      LOG_I(TAG, "MQTT message received: " + topic);
      LOG_D(TAG, "Payload: " + payload);

      // Handle sensor configuration
      String config_topic = String(TopicBuilder::buildConfigTopic());
      if (topic == config_topic) {
        handleSensorConfig(payload);
        handleActuatorConfig(payload);
        return;
      }

      // Actuator commands
      String actuator_command_prefix = String(TopicBuilder::buildActuatorCommandTopic(0));
      actuator_command_prefix.replace("/0/command", "/");
      if (topic.startsWith(actuator_command_prefix)) {
        actuatorManager.handleActuatorCommand(topic, payload);
        return;
      }

      // ✅ Phase 2C: Sensor commands (on-demand measurement)
      String sensor_command_prefix = String(TopicBuilder::buildSensorCommandTopic(0));
      sensor_command_prefix.replace("/0/command", "/");
      if (topic.startsWith(sensor_command_prefix) && topic.endsWith("/command")) {
        handleSensorCommand(topic, payload);
        return;
      }

      // ESP-specific emergency stop (with auth check)
      String esp_emergency_topic = String(TopicBuilder::buildActuatorEmergencyTopic());
      if (topic == esp_emergency_topic) {
        // Parse JSON payload for auth_token
        DynamicJsonDocument doc(256);
        DeserializationError error = deserializeJson(doc, payload);

        if (!error) {
          String command = doc["command"].as<String>();
          String auth_token = doc["auth_token"].as<String>();

          // Validate auth_token against stored ESP emergency token
          // Fail-open: If no token configured, accept any emergency stop (safety first)
          String stored_token = storageManager.getStringObj("emergency_auth", "");

          if (stored_token.length() > 0 && auth_token != stored_token) {
            LOG_E(TAG, "╔════════════════════════════════════════╗");
            LOG_E(TAG, "║  UNAUTHORIZED EMERGENCY-STOP ATTEMPT  ║");
            LOG_E(TAG, "╚════════════════════════════════════════╝");
            LOG_E(TAG, "[SECURITY] ESP emergency-stop rejected: invalid token");
            errorTracker.trackError(3500, ERROR_SEVERITY_CRITICAL,
                                   "ESP emergency-stop rejected: invalid auth_token");
            mqttClient.publish(esp_emergency_topic + "/error",
                              "{\"error\":\"unauthorized\",\"message\":\"Invalid auth_token\",\"seq\":" + String(mqttClient.getNextSeq()) + "}");
            return;
          }

          if (stored_token.length() == 0) {
            LOG_W(TAG, "ESP emergency accepted (no token configured - fail-open)");
          }

          if (command == "emergency_stop") {
            LOG_W(TAG, "╔════════════════════════════════════════╗");
            LOG_W(TAG, "║  AUTHORIZED EMERGENCY-STOP TRIGGERED  ║");
            LOG_W(TAG, "╚════════════════════════════════════════╝");
            safetyController.emergencyStopAll("ESP emergency command (authenticated)");
          } else if (command == "clear_emergency") {
            LOG_I(TAG, "╔════════════════════════════════════════╗");
            LOG_I(TAG, "║  AUTHORIZED EMERGENCY-CLEAR TRIGGERED ║");
            LOG_I(TAG, "╚════════════════════════════════════════╝");
            bool success = safetyController.clearEmergencyStop();
            if (success) {
              safetyController.resumeOperation();
              mqttClient.publish(esp_emergency_topic + "/response",
                                "{\"status\":\"emergency_cleared\",\"timestamp\":" + String(millis()) + ",\"seq\":" + String(mqttClient.getNextSeq()) + "}");
            } else {
              mqttClient.publish(esp_emergency_topic + "/error",
                                "{\"error\":\"clear_failed\",\"message\":\"Safety verification failed\",\"seq\":" + String(mqttClient.getNextSeq()) + "}");
            }
          }
        } else {
          LOG_E(TAG, "Failed to parse emergency command JSON");
        }
        return;
      }

      // Broadcast emergency (with auth check)
      String broadcast_emergency_topic = String(TopicBuilder::buildBroadcastEmergencyTopic());
      if (topic == broadcast_emergency_topic) {
        // Parse JSON payload for auth_token
        DynamicJsonDocument doc(256);
        DeserializationError error = deserializeJson(doc, payload);

        if (!error) {
          String auth_token = doc["auth_token"].as<String>();

          // Validate auth_token against stored broadcast emergency token
          // Fail-open: If no token configured, accept any broadcast (safety first)
          String stored_broadcast_token = storageManager.getStringObj("broadcast_em_tok", "");

          if (stored_broadcast_token.length() > 0 && auth_token != stored_broadcast_token) {
            LOG_E(TAG, "╔════════════════════════════════════════╗");
            LOG_E(TAG, "║  [SECURITY] UNAUTHORIZED BROADCAST     ║");
            LOG_E(TAG, "║  EMERGENCY-STOP ATTEMPT REJECTED       ║");
            LOG_E(TAG, "╚════════════════════════════════════════╝");
            LOG_E(TAG, "[SECURITY] Broadcast emergency-stop rejected: invalid token");
            errorTracker.trackError(3500, ERROR_SEVERITY_CRITICAL,
                                   "Broadcast emergency-stop rejected: invalid auth_token");
            return;
          }

          LOG_W(TAG, "╔════════════════════════════════════════╗");
          LOG_W(TAG, "║  BROADCAST EMERGENCY-STOP RECEIVED    ║");
          LOG_W(TAG, "╚════════════════════════════════════════╝");
          if (stored_broadcast_token.length() == 0) {
            LOG_W(TAG, "Broadcast emergency accepted (no token configured - fail-open)");
          }
          safetyController.emergencyStopAll("Broadcast emergency (God-Kaiser)");
        } else {
          LOG_E(TAG, "Failed to parse broadcast emergency JSON");
        }
        return;
      }

      // System commands (factory reset, etc.)
      String system_command_topic = String(TopicBuilder::buildSystemCommandTopic());

      if (topic == system_command_topic) {
        LOG_I(TAG, "Topic matched! Parsing JSON payload...");
        LOG_I(TAG, "Payload: " + payload);

        // Parse JSON payload
        DynamicJsonDocument doc(256);
        DeserializationError error = deserializeJson(doc, payload);

        if (error) {
          LOG_E(TAG, "JSON parse error: " + String(error.c_str()));
          LOG_E(TAG, "Raw payload: " + payload);
          return;
        }

        // JSON parsed successfully
        String command = doc["command"].as<String>();
        bool confirm = doc["confirm"] | false;
        LOG_I(TAG, "Command parsed: '" + command + "'");

        if (command == "factory_reset" && confirm) {
          LOG_W(TAG, "╔════════════════════════════════════════╗");
          LOG_W(TAG, "║  FACTORY RESET via MQTT               ║");
          LOG_W(TAG, "╚════════════════════════════════════════╝");

          // Acknowledge command
          String response = "{\"status\":\"factory_reset_initiated\",\"esp_id\":\"" +
                          configManager.getESPId() + "\",\"seq\":" + String(mqttClient.getNextSeq()) + "}";
          mqttClient.publish(system_command_topic + "/response", response);

          // Clear configs
          configManager.resetWiFiConfig();
          KaiserZone kaiser;
          MasterZone master;
          configManager.saveZoneConfig(kaiser, master);

          LOG_I(TAG, "✅ Configuration cleared via MQTT");
          LOG_I(TAG, "Rebooting in 3 seconds...");
          delay(3000);
          ESP.restart();
        }
        // ============================================
        // ONEWIRE SCAN COMMAND (Phase 4)
        // ============================================
        else if (command == "onewire/scan") {
          LOG_I(TAG, "╔════════════════════════════════════════╗");
          LOG_I(TAG, "║  ONEWIRE SCAN COMMAND RECEIVED        ║");
          LOG_I(TAG, "╚════════════════════════════════════════╝");

          uint8_t pin = doc["pin"] | HardwareConfig::DEFAULT_ONEWIRE_PIN;
          LOG_I(TAG, "OneWire scan on GPIO " + String(pin));

          if (!oneWireBusManager.isInitialized()) {
            LOG_I(TAG, "Initializing OneWire bus on GPIO " + String(pin));
            if (!oneWireBusManager.begin(pin)) {
              LOG_E(TAG, "Failed to initialize OneWire bus on GPIO " + String(pin));
              String error_response = "{\"error\":\"Failed to initialize OneWire bus\",\"pin\":" +
                                     String(pin) + ",\"seq\":" + String(mqttClient.getNextSeq()) + "}";
              mqttClient.publish(system_command_topic + "/response", error_response);
              return;
            }
          } else {
            uint8_t current_pin = oneWireBusManager.getPin();
            if (current_pin != pin) {
              LOG_W(TAG, "OneWire bus active on GPIO " + String(current_pin) +
                         ", ignoring scan request for GPIO " + String(pin));
              String error_response = "{\"error\":\"OneWire bus already on different pin\",\"requested_pin\":" +
                                     String(pin) + ",\"active_pin\":" + String(current_pin) + ",\"seq\":" + String(mqttClient.getNextSeq()) + "}";
              mqttClient.publish(system_command_topic + "/response", error_response);
              return;
            }
          }

          uint8_t rom_codes[10][8];
          uint8_t found_count = 0;

          LOG_I(TAG, "Scanning OneWire bus...");
          if (!oneWireBusManager.scanDevices(rom_codes, 10, found_count)) {
            LOG_E(TAG, "OneWire bus scan failed");
            String error_response = "{\"error\":\"OneWire scan failed\",\"pin\":" + String(pin) + ",\"seq\":" + String(mqttClient.getNextSeq()) + "}";
            mqttClient.publish(system_command_topic + "/response", error_response);
            return;
          }

          LOG_I(TAG, "OneWire scan complete: " + String(found_count) + " devices found");

          String response = "{\"devices\":[";
          for (uint8_t i = 0; i < found_count; i++) {
            if (i > 0) response += ",";
            response += "{";
            response += "\"rom_code\":\"";
            response += OneWireUtils::romToHexString(rom_codes[i]);
            response += "\",";
            response += "\"device_type\":\"";
            response += OneWireUtils::getDeviceType(rom_codes[i]);
            response += "\",";
            response += "\"pin\":";
            response += String(pin);
            response += "}";
          }
          response += "],\"found_count\":";
          response += String(found_count);
          response += ",\"seq\":";
          response += String(mqttClient.getNextSeq());
          response += "}";

          String scan_result_topic = "kaiser/god/esp/" + g_system_config.esp_id + "/onewire/scan_result";
          LOG_I(TAG, "Publishing scan result to: " + scan_result_topic);
          mqttClient.publish(scan_result_topic, response);

          String ack_response = "{\"command\":\"onewire/scan\",\"status\":\"ok\",\"found_count\":";
          ack_response += String(found_count);
          ack_response += ",\"pin\":";
          ack_response += String(pin);
          ack_response += ",\"seq\":";
          ack_response += String(mqttClient.getNextSeq());
          ack_response += "}";
          mqttClient.publish(system_command_topic + "/response", ack_response);

          LOG_I(TAG, "OneWire scan result published");
        }
        // ============================================
        // STATUS COMMAND (BUG-009 FIX)
        // ============================================
        else if (command == "status") {
          LOG_I(TAG, "╔════════════════════════════════════════╗");
          LOG_I(TAG, "║  STATUS COMMAND RECEIVED              ║");
          LOG_I(TAG, "╚════════════════════════════════════════╝");

          // Build status response (similar to heartbeat)
          time_t unix_timestamp = timeManager.getUnixTimestamp();

          DynamicJsonDocument response_doc(1024);
          response_doc["command"] = "status";
          response_doc["success"] = true;
          response_doc["esp_id"] = g_system_config.esp_id;
          response_doc["state"] = static_cast<int>(g_system_config.current_state);
          response_doc["uptime"] = millis() / 1000;
          response_doc["heap_free"] = ESP.getFreeHeap();
          response_doc["wifi_rssi"] = WiFi.RSSI();
          response_doc["sensor_count"] = sensorManager.getActiveSensorCount();
          response_doc["actuator_count"] = actuatorManager.getActiveActuatorCount();
          response_doc["zone_id"] = g_kaiser.zone_id;
          response_doc["zone_assigned"] = g_kaiser.zone_assigned;
          response_doc["ts"] = (unsigned long)unix_timestamp;
          response_doc["seq"] = mqttClient.getNextSeq();

          String response;
          serializeJson(response_doc, response);
          mqttClient.publish(system_command_topic + "/response", response);
          LOG_I(TAG, "Status command response sent");
        }
        // ============================================
        // DIAGNOSTICS COMMAND (BUG-009 FIX)
        // ============================================
        else if (command == "diagnostics") {
          LOG_I(TAG, "╔════════════════════════════════════════╗");
          LOG_I(TAG, "║  DIAGNOSTICS COMMAND RECEIVED         ║");
          LOG_I(TAG, "╚════════════════════════════════════════╝");

          // Build extended diagnostics response
          time_t unix_timestamp = timeManager.getUnixTimestamp();

          DynamicJsonDocument response_doc(2048);
          response_doc["command"] = "diagnostics";
          response_doc["success"] = true;
          response_doc["esp_id"] = g_system_config.esp_id;

          // System info
          response_doc["state"] = static_cast<int>(g_system_config.current_state);
          response_doc["uptime"] = millis() / 1000;
          response_doc["heap_free"] = ESP.getFreeHeap();
          response_doc["heap_min"] = ESP.getMinFreeHeap();
          response_doc["chip_model"] = ESP.getChipModel();
          response_doc["chip_revision"] = ESP.getChipRevision();
          response_doc["flash_size"] = ESP.getFlashChipSize();
          response_doc["sdk_version"] = ESP.getSdkVersion();

          // WiFi info
          response_doc["wifi_rssi"] = WiFi.RSSI();
          response_doc["wifi_ssid"] = WiFi.SSID();
          response_doc["wifi_ip"] = WiFi.localIP().toString();
          response_doc["wifi_mac"] = WiFi.macAddress();

          // Zone info
          response_doc["zone_id"] = g_kaiser.zone_id;
          response_doc["master_zone_id"] = g_kaiser.master_zone_id;
          response_doc["kaiser_id"] = g_kaiser.kaiser_id;
          response_doc["zone_assigned"] = g_kaiser.zone_assigned;

          // Hardware counts
          response_doc["sensor_count"] = sensorManager.getActiveSensorCount();
          response_doc["actuator_count"] = actuatorManager.getActiveActuatorCount();

          // Boot info
          response_doc["boot_count"] = g_system_config.boot_count;

          // Config status
          response_doc["config_status"] = serialized(configManager.getDiagnosticsJSON());

          response_doc["ts"] = (unsigned long)unix_timestamp;
          response_doc["seq"] = mqttClient.getNextSeq();

          String response;
          serializeJson(response_doc, response);
          mqttClient.publish(system_command_topic + "/response", response);
          LOG_I(TAG, "Diagnostics command response sent");
        }
        // ============================================
        // GET_CONFIG COMMAND (BUG-009 FIX)
        // ============================================
        else if (command == "get_config") {
          LOG_I(TAG, "╔════════════════════════════════════════╗");
          LOG_I(TAG, "║  GET_CONFIG COMMAND RECEIVED          ║");
          LOG_I(TAG, "╚════════════════════════════════════════╝");

          DynamicJsonDocument response_doc(2048);
          response_doc["command"] = "get_config";
          response_doc["success"] = true;
          response_doc["esp_id"] = g_system_config.esp_id;

          // Zone configuration
          JsonObject zone = response_doc.createNestedObject("zone");
          zone["zone_id"] = g_kaiser.zone_id;
          zone["master_zone_id"] = g_kaiser.master_zone_id;
          zone["zone_name"] = g_kaiser.zone_name;
          zone["kaiser_id"] = g_kaiser.kaiser_id;
          zone["zone_assigned"] = g_kaiser.zone_assigned;

          // Get sensor list
          JsonArray sensors = response_doc.createNestedArray("sensors");
          uint8_t sensor_count = sensorManager.getActiveSensorCount();
          for (uint8_t i = 0; i < sensor_count && i < 20; i++) {
            // Get sensor info via manager (simplified - just count for now)
          }
          response_doc["sensor_count"] = sensor_count;

          // Get actuator list
          JsonArray actuators = response_doc.createNestedArray("actuators");
          uint8_t actuator_count = actuatorManager.getActiveActuatorCount();
          response_doc["actuator_count"] = actuator_count;

          response_doc["ts"] = (unsigned long)timeManager.getUnixTimestamp();
          response_doc["seq"] = mqttClient.getNextSeq();

          String response;
          serializeJson(response_doc, response);
          mqttClient.publish(system_command_topic + "/response", response);
          LOG_I(TAG, "Get_config command response sent");
        }
        // ============================================
        // SAFE_MODE COMMAND (BUG-009 FIX)
        // ============================================
        else if (command == "safe_mode") {
          LOG_W(TAG, "╔════════════════════════════════════════╗");
          LOG_W(TAG, "║  SAFE_MODE COMMAND RECEIVED           ║");
          LOG_W(TAG, "╚════════════════════════════════════════╝");

          // Activate emergency stop on all actuators
          safetyController.emergencyStopAll("Safe mode activated via MQTT command");

          DynamicJsonDocument response_doc(256);
          response_doc["command"] = "safe_mode";
          response_doc["success"] = true;
          response_doc["esp_id"] = g_system_config.esp_id;
          response_doc["message"] = "Safe mode activated - all actuators stopped";
          response_doc["ts"] = (unsigned long)timeManager.getUnixTimestamp();
          response_doc["seq"] = mqttClient.getNextSeq();

          String response;
          serializeJson(response_doc, response);
          mqttClient.publish(system_command_topic + "/response", response);
          LOG_W(TAG, "Safe mode activated via command");
        }
        // ============================================
        // EXIT_SAFE_MODE COMMAND (BUG-009 FIX)
        // ============================================
        else if (command == "exit_safe_mode") {
          LOG_I(TAG, "╔════════════════════════════════════════╗");
          LOG_I(TAG, "║  EXIT_SAFE_MODE COMMAND RECEIVED      ║");
          LOG_I(TAG, "╚════════════════════════════════════════╝");

          // Clear emergency stop on all actuators
          safetyController.clearEmergencyStop();

          DynamicJsonDocument response_doc(256);
          response_doc["command"] = "exit_safe_mode";
          response_doc["success"] = true;
          response_doc["esp_id"] = g_system_config.esp_id;
          response_doc["message"] = "Safe mode deactivated - actuators can be controlled";
          response_doc["ts"] = (unsigned long)timeManager.getUnixTimestamp();
          response_doc["seq"] = mqttClient.getNextSeq();

          String response;
          serializeJson(response_doc, response);
          mqttClient.publish(system_command_topic + "/response", response);
          LOG_I(TAG, "Safe mode deactivated via command");
        }
        // ============================================
        // SET_LOG_LEVEL COMMAND (Phase 0: ser2net prep)
        // ============================================
        else if (command == "set_log_level") {
          LOG_I(TAG, "╔════════════════════════════════════════╗");
          LOG_I(TAG, "║  SET_LOG_LEVEL COMMAND RECEIVED       ║");
          LOG_I(TAG, "╚════════════════════════════════════════╝");

          // Extract level from payload (two formats supported):
          //   Flat:   {"command":"set_log_level","level":"DEBUG"}
          //   Params: {"command":"set_log_level","params":{"level":"DEBUG"}}
          String level;
          if (doc.containsKey("level")) {
            level = doc["level"].as<String>();
          } else if (doc.containsKey("params") && doc["params"].containsKey("level")) {
            level = doc["params"]["level"].as<String>();
          }
          level.toUpperCase();
          LOG_I(TAG, "Requested log level: " + level);

          // Map string to LogLevel enum using Logger's static method
          LogLevel new_level = Logger::getLogLevelFromString(level.c_str());

          // Validate level (getLogLevelFromString returns LOG_INFO for invalid)
          bool valid = (level.length() > 0 &&
                       (level == "DEBUG" || level == "INFO" || level == "WARNING" ||
                        level == "ERROR" || level == "CRITICAL"));

          DynamicJsonDocument response_doc(256);
          response_doc["command"] = "set_log_level";
          response_doc["esp_id"] = g_system_config.esp_id;

          if (valid) {
            logger.setLogLevel(new_level);

            // Persist to NVS for boot recovery
            if (storageManager.beginNamespace("system_config", false)) {
              storageManager.putUInt8("log_level", (uint8_t)new_level);
              storageManager.endNamespace();
            }

            response_doc["success"] = true;
            response_doc["level"] = level;
            response_doc["message"] = "Log level changed to " + level;
            response_doc["persisted"] = true;
            response_doc["ts"] = (unsigned long)timeManager.getUnixTimestamp();

            LOG_I(TAG, "✅ Log level changed to " + level + " (persisted to NVS)");
          } else {
            response_doc["success"] = false;
            response_doc["error"] = "Invalid log level";
            response_doc["message"] = "Valid levels: DEBUG, INFO, WARNING, ERROR, CRITICAL";
            response_doc["requested_level"] = level;
            response_doc["ts"] = (unsigned long)timeManager.getUnixTimestamp();

            LOG_E(TAG, "❌ Invalid log level: " + level);
          }

          response_doc["seq"] = mqttClient.getNextSeq();

          String response;
          serializeJson(response_doc, response);
          mqttClient.publish(system_command_topic + "/response", response);
        }
        // ============================================
        // SET_EMERGENCY_TOKEN COMMAND (Security)
        // ============================================
        else if (command == "set_emergency_token") {
          LOG_I(TAG, "╔════════════════════════════════════════╗");
          LOG_I(TAG, "║  SET_EMERGENCY_TOKEN COMMAND RECEIVED  ║");
          LOG_I(TAG, "╚════════════════════════════════════════╝");

          String token_type = doc["token_type"] | "esp";  // "esp" or "broadcast"
          String token_value = doc["token"].as<String>();

          DynamicJsonDocument response_doc(256);
          response_doc["command"] = "set_emergency_token";
          response_doc["esp_id"] = g_system_config.esp_id;

          if (token_value.length() == 0 || token_value.length() > 64) {
            response_doc["success"] = false;
            response_doc["error"] = "Token must be 1-64 characters";
          } else if (token_type == "broadcast") {
            storageManager.putString("broadcast_em_tok", token_value);
            response_doc["success"] = true;
            response_doc["token_type"] = "broadcast";
            response_doc["message"] = "Broadcast emergency token updated";
            LOG_I(TAG, "Broadcast emergency token updated (persisted to NVS)");
          } else {
            storageManager.putString("emergency_auth", token_value);
            response_doc["success"] = true;
            response_doc["token_type"] = "esp";
            response_doc["message"] = "ESP emergency token updated";
            LOG_I(TAG, "ESP emergency token updated (persisted to NVS)");
          }

          response_doc["ts"] = (unsigned long)timeManager.getUnixTimestamp();
          response_doc["seq"] = mqttClient.getNextSeq();

          String response;
          serializeJson(response_doc, response);
          mqttClient.publish(system_command_topic + "/response", response);
        }
        // Unknown command
        else {
          LOG_W(TAG, "Unknown system command: '" + command + "'");

          // Send error response for unknown commands
          DynamicJsonDocument response_doc(256);
          response_doc["command"] = command;
          response_doc["success"] = false;
          response_doc["esp_id"] = g_system_config.esp_id;
          response_doc["error"] = "Unknown command";
          response_doc["ts"] = (unsigned long)timeManager.getUnixTimestamp();
          response_doc["seq"] = mqttClient.getNextSeq();

          String response;
          serializeJson(response_doc, response);
          mqttClient.publish(system_command_topic + "/response", response);
        }
        return;
      }

      // Phase 7: Zone Assignment Handler
      // WP3: Use TopicBuilder for zone assign topic
      String zone_assign_topic = TopicBuilder::buildZoneAssignTopic();

      if (topic == zone_assign_topic) {
        LOG_I(TAG, "╔════════════════════════════════════════╗");
        LOG_I(TAG, "║  ZONE ASSIGNMENT RECEIVED             ║");
        LOG_I(TAG, "╚════════════════════════════════════════╝");

        // Parse JSON payload
        DynamicJsonDocument doc(512);
        DeserializationError error = deserializeJson(doc, payload);

        if (!error) {
          String zone_id = doc["zone_id"].as<String>();
          String master_zone_id = doc["master_zone_id"].as<String>();
          String zone_name = doc["zone_name"].as<String>();
          String kaiser_id = doc["kaiser_id"].as<String>();

          // WP1: Empty zone_id = Zone Removal
          if (zone_id.length() == 0) {
            LOG_I(TAG, "╔════════════════════════════════════════╗");
            LOG_I(TAG, "║  ZONE REMOVAL DETECTED                ║");
            LOG_I(TAG, "╚════════════════════════════════════════╝");

            // WP1: Cascade-remove ALL subzones first (avoid orphaned subzones)
            SubzoneConfig subzone_configs[8];  // MAX_SUBZONES_PER_ESP = 8
            uint8_t loaded_count = 0;
            configManager.loadAllSubzoneConfigs(subzone_configs, 8, loaded_count);

            for (uint8_t i = 0; i < loaded_count; i++) {
              // Free GPIOs
              for (uint8_t gpio : subzone_configs[i].assigned_gpios) {
                gpioManager.removePinFromSubzone(gpio);
              }
              // Remove from NVS
              configManager.removeSubzoneConfig(subzone_configs[i].subzone_id);
              LOG_I(TAG, "  Cascade-removed subzone: " + subzone_configs[i].subzone_id);
            }

            if (loaded_count > 0) {
              LOG_I(TAG, "✅ Cascade-removed " + String(loaded_count) + " subzone(s)");
            }

            // Clear zone configuration in NVS
            if (configManager.updateZoneAssignment("", "", "", kaiser_id.length() > 0 ? kaiser_id : "god")) {
              // Update global variables
              g_kaiser.zone_id = "";
              g_kaiser.master_zone_id = "";
              g_kaiser.zone_name = "";
              g_kaiser.zone_assigned = false;

              // Send zone_removed acknowledgment
              String ack_topic = TopicBuilder::buildZoneAckTopic();
              DynamicJsonDocument ack_doc(256);
              ack_doc["esp_id"] = g_system_config.esp_id;
              ack_doc["status"] = "zone_removed";
              ack_doc["zone_id"] = "";
              ack_doc["master_zone_id"] = "";
              ack_doc["ts"] = (unsigned long)timeManager.getUnixTimestamp();
              ack_doc["seq"] = mqttClient.getNextSeq();

              String ack_payload;
              size_t written = serializeJson(ack_doc, ack_payload);
              if (written == 0 || ack_payload.length() == 0) {
                LOG_E(TAG, "JSON serialization failed for Zone Removal ACK");
                ack_payload = "{\"esp_id\":\"" + g_system_config.esp_id +
                             "\",\"status\":\"error\",\"message\":\"serialization_failed\",\"ts\":0}";
              }
              mqttClient.publish(ack_topic, ack_payload);

              LOG_I(TAG, "✅ Zone removed successfully");

              // Update system state
              g_system_config.current_state = STATE_PENDING_APPROVAL;
              configManager.saveSystemConfig(g_system_config);

              // Send updated heartbeat
              mqttClient.publishHeartbeat(true);
            } else {
              LOG_E(TAG, "❌ Failed to remove zone configuration");

              // Send error acknowledgment
              String ack_topic = TopicBuilder::buildZoneAckTopic();
              String error_response = "{\"esp_id\":\"" + g_system_config.esp_id +
                                     "\",\"status\":\"error\",\"ts\":" + String((unsigned long)timeManager.getUnixTimestamp()) +
                                     ",\"seq\":" + String(mqttClient.getNextSeq()) +
                                     ",\"message\":\"Failed to remove zone config\"}";
              mqttClient.publish(ack_topic, error_response);
            }
            return;
          }

          // Zone Assignment (zone_id not empty)
          // Kaiser_id optional (if empty, use default "god")
          if (kaiser_id.length() == 0) {
            LOG_W(TAG, "Kaiser_id empty, using default 'god'");
            kaiser_id = "god";
          }

          LOG_I(TAG, "Zone ID: " + zone_id);
          LOG_I(TAG, "Master Zone: " + master_zone_id);
          LOG_I(TAG, "Zone Name: " + zone_name);
          LOG_I(TAG, "Kaiser ID: " + kaiser_id);

          // WP5: Validate zone configuration BEFORE updating
          KaiserZone temp_kaiser;
          temp_kaiser.zone_id = zone_id;
          temp_kaiser.master_zone_id = master_zone_id;
          temp_kaiser.zone_name = zone_name;
          temp_kaiser.kaiser_id = kaiser_id;
          temp_kaiser.zone_assigned = true;

          if (!configManager.validateZoneConfig(temp_kaiser)) {
            LOG_E(TAG, "❌ Zone configuration validation failed");

            // Send error acknowledgment
            String ack_topic = TopicBuilder::buildZoneAckTopic();
            String error_response = "{\"esp_id\":\"" + g_system_config.esp_id +
                                   "\",\"status\":\"error\",\"ts\":" + String((unsigned long)timeManager.getUnixTimestamp()) +
                                   ",\"seq\":" + String(mqttClient.getNextSeq()) +
                                   ",\"message\":\"Zone validation failed\"}";
            mqttClient.publish(ack_topic, error_response);
            return;
          }

          // Update zone configuration
          if (configManager.updateZoneAssignment(zone_id, master_zone_id, zone_name, kaiser_id)) {
            // Update global variables
            g_kaiser.zone_id = zone_id;
            g_kaiser.master_zone_id = master_zone_id;
            g_kaiser.zone_name = zone_name;
            g_kaiser.zone_assigned = true;
            if (kaiser_id.length() > 0 && kaiser_id != g_kaiser.kaiser_id) {
              // WP3-Fix: Store old kaiser_id before updating
              String old_kaiser_id = g_kaiser.kaiser_id;

              // WP3-Fix: Unsubscribe from ALL old topics to prevent duplicate messages
              // Build topics manually with old kaiser_id (TopicBuilder not updated yet)
              String old_zone_assign = "kaiser/" + old_kaiser_id + "/esp/" + g_system_config.esp_id + "/zone/assign";
              String old_sensor_cmd = "kaiser/" + old_kaiser_id + "/esp/" + g_system_config.esp_id + "/sensor/+/command";
              String old_subzone_assign = "kaiser/" + old_kaiser_id + "/esp/" + g_system_config.esp_id + "/subzone/assign";
              String old_subzone_remove = "kaiser/" + old_kaiser_id + "/esp/" + g_system_config.esp_id + "/subzone/remove";
              String old_subzone_safe = "kaiser/" + old_kaiser_id + "/esp/" + g_system_config.esp_id + "/subzone/safe";
              String old_actuator_cmd = "kaiser/" + old_kaiser_id + "/esp/" + g_system_config.esp_id + "/actuator/+/command";
              String old_heartbeat_ack = "kaiser/" + old_kaiser_id + "/system/heartbeat/ack";

              mqttClient.unsubscribe(old_zone_assign);
              mqttClient.unsubscribe(old_sensor_cmd);
              mqttClient.unsubscribe(old_subzone_assign);
              mqttClient.unsubscribe(old_subzone_remove);
              mqttClient.unsubscribe(old_subzone_safe);
              mqttClient.unsubscribe(old_actuator_cmd);
              mqttClient.unsubscribe(old_heartbeat_ack);

              LOG_I(TAG, "Unsubscribed from old kaiser_id topics: " + old_kaiser_id);

              // Update global kaiser_id and TopicBuilder
              g_kaiser.kaiser_id = kaiser_id;
              // Update TopicBuilder with new kaiser_id
              TopicBuilder::setKaiserId(kaiser_id.c_str());

              // WP3: Re-subscribe to topics after kaiser_id change
              // Topics that depend on kaiser_id need to be re-subscribed
              LOG_I(TAG, "Kaiser ID changed - re-subscribing to topics...");

              // Re-subscribe to zone topic
              mqttClient.subscribe(TopicBuilder::buildZoneAssignTopic());

              // Re-subscribe to sensor command wildcard
              String sensor_cmd_wildcard = String(TopicBuilder::buildSensorCommandTopic(0));
              sensor_cmd_wildcard.replace("/0/command", "/+/command");
              mqttClient.subscribe(sensor_cmd_wildcard);

              // Re-subscribe to subzone topics
              mqttClient.subscribe(TopicBuilder::buildSubzoneAssignTopic());
              mqttClient.subscribe(TopicBuilder::buildSubzoneRemoveTopic());
              mqttClient.subscribe(TopicBuilder::buildSubzoneSafeTopic());

              // Re-subscribe to actuator command wildcard
              String actuator_cmd_wildcard = String(TopicBuilder::buildActuatorCommandTopic(0));
              actuator_cmd_wildcard.replace("/0/command", "/+/command");
              mqttClient.subscribe(actuator_cmd_wildcard);

              // Re-subscribe to heartbeat ack
              mqttClient.subscribe(TopicBuilder::buildSystemHeartbeatAckTopic());

              LOG_I(TAG, "Topics re-subscribed with new kaiser_id: " + kaiser_id);
            }

            // Send acknowledgment
            String ack_topic = "kaiser/" + g_kaiser.kaiser_id + "/esp/" + g_system_config.esp_id + "/zone/ack";
            DynamicJsonDocument ack_doc(256);
            ack_doc["esp_id"] = g_system_config.esp_id;
            ack_doc["status"] = "zone_assigned";
            ack_doc["zone_id"] = zone_id;
            ack_doc["master_zone_id"] = master_zone_id;
            ack_doc["ts"] = (unsigned long)timeManager.getUnixTimestamp();
            ack_doc["seq"] = mqttClient.getNextSeq();

            String ack_payload;
            size_t written = serializeJson(ack_doc, ack_payload);
            if (written == 0 || ack_payload.length() == 0) {
              LOG_E(TAG, "JSON serialization failed for Zone ACK");
              // Fallback: Send minimal ACK with required ts field
              ack_payload = "{\"esp_id\":\"" + g_system_config.esp_id +
                           "\",\"status\":\"error\",\"message\":\"serialization_failed\",\"ts\":0}";
            }
            mqttClient.publish(ack_topic, ack_payload);

            LOG_I(TAG, "✅ Zone assignment successful");
            LOG_I(TAG, "ESP is now part of zone: " + zone_id);

            // Update system state
            g_system_config.current_state = STATE_ZONE_CONFIGURED;
            configManager.saveSystemConfig(g_system_config);

            // Send updated heartbeat (force=true to immediately notify server of zone change)
            mqttClient.publishHeartbeat(true);
          } else {
            LOG_E(TAG, "❌ Failed to save zone configuration");

            // Send error acknowledgment
            String ack_topic = "kaiser/" + g_kaiser.kaiser_id + "/esp/" + g_system_config.esp_id + "/zone/ack";
            String error_response = "{\"esp_id\":\"" + g_system_config.esp_id +
                                   "\",\"status\":\"error\",\"ts\":" + String((unsigned long)timeManager.getUnixTimestamp()) +
                                   ",\"seq\":" + String(mqttClient.getNextSeq()) +
                                   ",\"message\":\"Failed to save zone config\"}";
            mqttClient.publish(ack_topic, error_response);
          }
        } else {
          LOG_E(TAG, "Failed to parse zone assignment JSON");
        }
        return;
      }

      // Phase 9: Subzone Assignment Handler
      String subzone_assign_topic = TopicBuilder::buildSubzoneAssignTopic();
      if (topic == subzone_assign_topic) {
        LOG_I(TAG, "╔════════════════════════════════════════╗");
        LOG_I(TAG, "║  SUBZONE ASSIGNMENT RECEIVED          ║");
        LOG_I(TAG, "╚════════════════════════════════════════╝");

        DynamicJsonDocument doc(1024);  // Größerer Buffer für GPIO-Array
        DeserializationError error = deserializeJson(doc, payload);

        if (!error) {
          String subzone_id = doc["subzone_id"].as<String>();
          String subzone_name = doc["subzone_name"].as<String>();
          String parent_zone_id = doc["parent_zone_id"].as<String>();
          JsonArray gpios_array = doc["assigned_gpios"];
          bool safe_mode_active = doc["safe_mode_active"] | true;

          // Validation 1: subzone_id required
          if (subzone_id.length() == 0) {
            LOG_E(TAG, "Subzone assignment failed: subzone_id is empty");
            sendSubzoneAck(subzone_id, "error", "subzone_id is required");
            return;
          }

          // Validation 2: parent_zone_id muss mit ESP-Zone übereinstimmen
          if (parent_zone_id.length() > 0 && parent_zone_id != g_kaiser.zone_id) {
            LOG_E(TAG, "Subzone assignment failed: parent_zone_id doesn't match ESP zone");
            sendSubzoneAck(subzone_id, "error", "parent_zone_id mismatch");
            return;
          }

          // Validation 3: Zone muss zugewiesen sein
          if (!g_kaiser.zone_assigned) {
            LOG_E(TAG, "Subzone assignment failed: ESP zone not assigned");
            sendSubzoneAck(subzone_id, "error", "ESP zone not assigned");
            return;
          }

          // Build SubzoneConfig
          SubzoneConfig subzone_config;
          subzone_config.subzone_id = subzone_id;
          subzone_config.subzone_name = subzone_name;
          subzone_config.parent_zone_id = parent_zone_id.length() > 0 ? parent_zone_id : g_kaiser.zone_id;
          subzone_config.safe_mode_active = safe_mode_active;
          subzone_config.created_timestamp = doc["timestamp"] | millis() / 1000;

          // Parse GPIO-Array
          for (JsonVariant gpio_value : gpios_array) {
            uint8_t gpio = gpio_value.as<uint8_t>();
            subzone_config.assigned_gpios.push_back(gpio);
          }

          // Validate config
          if (!configManager.validateSubzoneConfig(subzone_config)) {
            LOG_E(TAG, "Subzone assignment failed: validation failed");
            sendSubzoneAck(subzone_id, "error", "subzone config validation failed");
            return;
          }

          // Assign GPIOs to subzone via GPIO-Manager
          bool all_assigned = true;
          for (uint8_t gpio : subzone_config.assigned_gpios) {
            if (!gpioManager.assignPinToSubzone(gpio, subzone_id)) {
              LOG_E(TAG, "Failed to assign GPIO " + String(gpio) + " to subzone");
              all_assigned = false;
              // Rollback: Entferne bereits zugewiesene GPIOs
              for (uint8_t assigned_gpio : subzone_config.assigned_gpios) {
                if (assigned_gpio != gpio) {
                  gpioManager.removePinFromSubzone(assigned_gpio);
                }
              }
              break;
            }
          }

          if (!all_assigned) {
            sendSubzoneAck(subzone_id, "error", "GPIO assignment failed");
            return;
          }

          // Safe-Mode aktivieren wenn requested
          if (safe_mode_active) {
            if (!gpioManager.enableSafeModeForSubzone(subzone_id)) {
              LOG_W(TAG, "Failed to enable safe-mode for subzone, but assignment continues");
            }
          }

          // Save to NVS
          if (!configManager.saveSubzoneConfig(subzone_config)) {
            LOG_E(TAG, "Failed to save subzone config to NVS");
            sendSubzoneAck(subzone_id, "error", "NVS save failed");
            return;
          }

          // Calculate sensor/actuator counts
          subzone_config.sensor_count = 0;
          subzone_config.actuator_count = 0;
          // TODO: Iterate through sensors/actuators and count those with matching subzone_id

          // Success ACK
          sendSubzoneAck(subzone_id, "subzone_assigned", "");

          LOG_I(TAG, "✅ Subzone assignment successful: " + subzone_id);
        } else {
          LOG_E(TAG, "Failed to parse subzone assignment JSON");
          sendSubzoneAck("", "error", "JSON parse failed");
        }
        return;
      }

      // Phase 9: Subzone Removal Handler
      String subzone_remove_topic = TopicBuilder::buildSubzoneRemoveTopic();
      if (topic == subzone_remove_topic) {
        LOG_I(TAG, "╔════════════════════════════════════════╗");
        LOG_I(TAG, "║  SUBZONE REMOVAL RECEIVED             ║");
        LOG_I(TAG, "╚════════════════════════════════════════╝");

        DynamicJsonDocument doc(256);
        DeserializationError error = deserializeJson(doc, payload);

        if (!error) {
          String subzone_id = doc["subzone_id"].as<String>();

          if (subzone_id.length() == 0) {
            LOG_E(TAG, "Subzone removal failed: subzone_id is empty");
            return;
          }

          // Load config to get GPIOs
          SubzoneConfig config;
          if (!configManager.loadSubzoneConfig(subzone_id, config)) {
            LOG_W(TAG, "Subzone " + subzone_id + " not found for removal");
            return;
          }

          // Remove GPIOs from subzone
          for (uint8_t gpio : config.assigned_gpios) {
            gpioManager.removePinFromSubzone(gpio);
          }

          // Remove from NVS
          configManager.removeSubzoneConfig(subzone_id);

          // WP8: Send subzone_removed acknowledgment
          sendSubzoneAck(subzone_id, "subzone_removed", "");

          LOG_I(TAG, "✅ Subzone removed: " + subzone_id);
        }
        return;
      }

      // Phase 9: Subzone Safe-Mode Handler (B4 Fix)
      String subzone_safe_topic = TopicBuilder::buildSubzoneSafeTopic();
      if (topic == subzone_safe_topic) {
        LOG_I(TAG, "╔════════════════════════════════════════╗");
        LOG_I(TAG, "║  SUBZONE SAFE-MODE RECEIVED           ║");
        LOG_I(TAG, "╚════════════════════════════════════════╝");

        DynamicJsonDocument doc(512);
        DeserializationError error = deserializeJson(doc, payload);

        if (!error) {
          String subzone_id = doc["subzone_id"].as<String>();
          String action = doc["action"].as<String>();
          bool safe_mode = doc["safe_mode"] | (action == "enable");

          if (subzone_id.length() == 0) {
            LOG_E(TAG, "Subzone safe-mode failed: subzone_id is empty");
            return;
          }

          SubzoneConfig config;
          if (!configManager.loadSubzoneConfig(subzone_id, config)) {
            LOG_W(TAG, "Subzone " + subzone_id + " not found for safe-mode");
            return;
          }

          if (action == "enable" || safe_mode) {
            if (gpioManager.enableSafeModeForSubzone(subzone_id)) {
              config.safe_mode_active = true;
              configManager.saveSubzoneConfig(config);
              LOG_I(TAG, "✅ Safe-mode ENABLED for subzone: " + subzone_id);
            } else {
              LOG_E(TAG, "Failed to enable safe-mode for subzone: " + subzone_id);
            }
          } else if (action == "disable" || !safe_mode) {
            if (gpioManager.disableSafeModeForSubzone(subzone_id)) {
              config.safe_mode_active = false;
              configManager.saveSubzoneConfig(config);
              LOG_I(TAG, "✅ Safe-mode DISABLED for subzone: " + subzone_id);
            } else {
              LOG_E(TAG, "Failed to disable safe-mode for subzone: " + subzone_id);
            }
          }
        } else {
          LOG_E(TAG, "Failed to parse subzone safe-mode JSON");
        }
        return;
      }

      // ============================================
      // Phase 2: Heartbeat-ACK Handler (Server → ESP)
      // ============================================
      // Server sends ACK after each heartbeat with device approval status
      // This allows ESP to transition from PENDING_APPROVAL → OPERATIONAL
      // without requiring a reboot after admin approval
      String heartbeat_ack_topic = TopicBuilder::buildSystemHeartbeatAckTopic();
      if (topic == heartbeat_ack_topic) {
        LOG_D(TAG, "Heartbeat ACK received");

        DynamicJsonDocument doc(256);
        DeserializationError error = deserializeJson(doc, payload);

        if (error) {
          LOG_W(TAG, "Heartbeat ACK parse error: " + String(error.c_str()));
          return;
        }

        // ============================================
        // REGISTRATION GATE OPEN (Bug #1 Fix)
        // ============================================
        // ANY valid heartbeat ACK = Server hat uns registriert
        mqttClient.confirmRegistration();

        const char* status = doc["status"] | "unknown";
        bool config_available = doc["config_available"] | false;
        unsigned long server_time = doc["server_time"] | 0;

        LOG_D(TAG, "  Status: " + String(status) + ", Config available: " +
                  String(config_available ? "yes" : "no"));

        // ============================================
        // Status-based State Transitions
        // ============================================

        if (strcmp(status, "approved") == 0 || strcmp(status, "online") == 0) {
          // Server has approved this ESP
          if (g_system_config.current_state == STATE_PENDING_APPROVAL) {
            LOG_I(TAG, "╔════════════════════════════════════════╗");
            LOG_I(TAG, "║   DEVICE APPROVED BY SERVER            ║");
            LOG_I(TAG, "╚════════════════════════════════════════╝");
            LOG_I(TAG, "Transitioning from PENDING_APPROVAL to OPERATIONAL");

            // Persist approval status to NVS
            time_t approval_ts = server_time > 0 ? (time_t)server_time : timeManager.getUnixTimestamp();
            configManager.setDeviceApproved(true, approval_ts);

            // State transition - NO REBOOT REQUIRED
            g_system_config.current_state = STATE_OPERATIONAL;
            configManager.saveSystemConfig(g_system_config);

            LOG_I(TAG, "  → Sensors/Actuators now ENABLED");
            LOG_I(TAG, "  → Full operational mode active");

            // Note: Config will arrive via separate config topic if available
            if (config_available) {
              LOG_I(TAG, "  → Server has config available - awaiting config push");
            }
          }
          // If already OPERATIONAL: Normal operation, no action needed
        }
        else if (strcmp(status, "pending_approval") == 0) {
          // ESP is still pending approval
          if (g_system_config.current_state != STATE_PENDING_APPROVAL) {
            LOG_I(TAG, "Server reports: PENDING APPROVAL - entering limited mode");
            g_system_config.current_state = STATE_PENDING_APPROVAL;
            // Do NOT persist to NVS - this is a transient state
          }
        }
        else if (strcmp(status, "rejected") == 0) {
          // ESP has been rejected by admin
          LOG_W(TAG, "╔════════════════════════════════════════╗");
          LOG_W(TAG, "║   DEVICE REJECTED BY SERVER            ║");
          LOG_W(TAG, "╚════════════════════════════════════════╝");

          // Track error for diagnostics
          errorTracker.trackError(
            ERROR_DEVICE_REJECTED,
            ERROR_SEVERITY_ERROR,
            "Device rejected by server administrator"
          );

          // Clear approval flag
          configManager.setDeviceApproved(false, 0);

          // Enter error state
          g_system_config.current_state = STATE_ERROR;
          configManager.saveSystemConfig(g_system_config);

          LOG_W(TAG, "  → Device in ERROR state");
          LOG_W(TAG, "  → Manual intervention required");
        }
        else {
          LOG_D(TAG, "Unknown heartbeat ACK status: " + String(status));
        }

        return;
      }

      // Additional message handlers can be added here
    });

    // ============================================
    // PHASE 1E: INITIAL APPROVAL CHECK
    // ============================================
    // After MQTT subscriptions are complete, check if device is approved.
    // If not approved → enter PENDING_APPROVAL state (limited operation)
    // If approved → continue to OPERATIONAL state (normal operation)
    if (!configManager.isDeviceApproved()) {
      // New device or not yet approved → Limited operation mode
      g_system_config.current_state = STATE_PENDING_APPROVAL;
      LOG_I(TAG, "Device not yet approved - entering PENDING_APPROVAL state");
      LOG_I(TAG, "  → WiFi/MQTT active (heartbeats + diagnostics)");
      LOG_I(TAG, "  → Sensors/Actuators DISABLED until approval");
    } else {
      // Previously approved → Normal operation
      g_system_config.current_state = STATE_OPERATIONAL;
      LOG_I(TAG, "Device previously approved - continuing normal operation");
    }
  }

  LOG_I(TAG, "╔════════════════════════════════════════╗");
  LOG_I(TAG, "║   Phase 2: Communication Layer READY  ║");
  LOG_I(TAG, "╚════════════════════════════════════════╝");
  LOG_I(TAG, "Modules Initialized:");
  LOG_I(TAG, "  ✅ WiFi Manager");
  LOG_I(TAG, "  ✅ MQTT Client");
  LOG_I(TAG, "");

  // Print memory stats
  LOG_I(TAG, "=== Memory Status (Phase 2) ===");
  LOG_I(TAG, "Free Heap: " + String(ESP.getFreeHeap()) + " bytes");
  LOG_I(TAG, "Min Free Heap: " + String(ESP.getMinFreeHeap()) + " bytes");
  LOG_I(TAG, "Heap Size: " + String(ESP.getHeapSize()) + " bytes");
  LOG_I(TAG, "=====================");

  // ============================================
  // STEP 10.5: PHASE 7 - HEALTH MONITOR
  // ============================================
  if (!healthMonitor.begin()) {
    LOG_E(TAG, "HealthMonitor initialization failed!");
    errorTracker.trackError(ERROR_SYSTEM_INIT_FAILED, ERROR_SEVERITY_ERROR,
                           "HealthMonitor begin() failed");
  } else {
    LOG_I(TAG, "Health Monitor initialized");
    healthMonitor.setPublishInterval(60000);  // 60 seconds
    healthMonitor.setChangeDetectionEnabled(true);
  }

  // ============================================
  // STEP 11: PHASE 3 - HARDWARE ABSTRACTION LAYER
  // ============================================
  LOG_I(TAG, "╔════════════════════════════════════════╗");
  LOG_I(TAG, "║   Phase 3: Hardware Abstraction Layer  ║");
  LOG_I(TAG, "╚════════════════════════════════════════╝");

  // I2C Bus Manager
  if (!i2cBusManager.begin()) {
    LOG_E(TAG, "I2C Bus Manager initialization failed!");
    errorTracker.trackError(ERROR_I2C_INIT_FAILED,
                           ERROR_SEVERITY_CRITICAL,
                           "I2C begin() failed");
  } else {
    LOG_I(TAG, "I2C Bus Manager initialized");
  }

  // OneWire Bus Manager — lazy init (on-demand when DS18B20 sensor is configured)
  // SensorManager.configureSensor() calls oneWireBusManager.begin(gpio) when needed.
  // Skipping unconditional init avoids reserving GPIO 4 on non-OneWire ESPs.
  LOG_I(TAG, "OneWire Bus Manager: deferred (on-demand init)");

  // PWM Controller
  if (!pwmController.begin()) {
    LOG_E(TAG, "PWM Controller initialization failed!");
    errorTracker.trackError(ERROR_PWM_INIT_FAILED,
                           ERROR_SEVERITY_CRITICAL,
                           "PWM begin() failed");
  } else {
    LOG_I(TAG, "PWM Controller initialized");
  }

  LOG_I(TAG, "╔════════════════════════════════════════╗");
  LOG_I(TAG, "║   Phase 3: Hardware Abstraction READY  ║");
  LOG_I(TAG, "╚════════════════════════════════════════╝");
  LOG_I(TAG, "Modules Initialized:");
  LOG_I(TAG, "  ✅ I2C Bus Manager");
  LOG_I(TAG, "  ⏳ OneWire Bus Manager (on-demand)");
  LOG_I(TAG, "  ✅ PWM Controller");
  LOG_I(TAG, "");

  // Print memory stats
  LOG_I(TAG, "=== Memory Status (Phase 3) ===");
  LOG_I(TAG, "Free Heap: " + String(ESP.getFreeHeap()) + " bytes");
  LOG_I(TAG, "Min Free Heap: " + String(ESP.getMinFreeHeap()) + " bytes");
  LOG_I(TAG, "Heap Size: " + String(ESP.getHeapSize()) + " bytes");
  LOG_I(TAG, "=====================");

  // ============================================
  // STEP 12: PHASE 4 - SENSOR SYSTEM
  // ============================================
  LOG_I(TAG, "╔════════════════════════════════════════╗");
  LOG_I(TAG, "║   Phase 4: Sensor System               ║");
  LOG_I(TAG, "╚════════════════════════════════════════╝");

  // Sensor Manager
  if (!sensorManager.begin()) {
    LOG_E(TAG, "Sensor Manager initialization failed!");
    errorTracker.trackError(ERROR_SENSOR_INIT_FAILED,
                           ERROR_SEVERITY_CRITICAL,
                           "SensorManager begin() failed");
  } else {
    LOG_I(TAG, "Sensor Manager initialized");

    // Phase 2: Configure measurement interval (5 seconds)
    sensorManager.setMeasurementInterval(5000);

    // Load sensor configs from NVS
    SensorConfig sensors[10];
    uint8_t loaded_count = 0;
    if (configManager.loadSensorConfig(sensors, 10, loaded_count)) {
      LOG_I(TAG, "Loaded " + String(loaded_count) + " sensor configs from NVS");
      for (uint8_t i = 0; i < loaded_count; i++) {
        sensorManager.configureSensor(sensors[i]);
      }
    }
  }

  LOG_I(TAG, "╔════════════════════════════════════════╗");
  LOG_I(TAG, "║   Phase 4: Sensor System READY         ║");
  LOG_I(TAG, "╚════════════════════════════════════════╝");
  LOG_I(TAG, "Modules Initialized:");
  LOG_I(TAG, "  ✅ Sensor Manager");
  LOG_I(TAG, "");

  // Print memory stats
  LOG_I(TAG, "=== Memory Status (Phase 4) ===");
  LOG_I(TAG, "Free Heap: " + String(ESP.getFreeHeap()) + " bytes");
  LOG_I(TAG, "Min Free Heap: " + String(ESP.getMinFreeHeap()) + " bytes");
  LOG_I(TAG, "Heap Size: " + String(ESP.getHeapSize()) + " bytes");
  LOG_I(TAG, "=====================");

  // ============================================
  // STEP 13: PHASE 5 - ACTUATOR SYSTEM
  // ============================================
  LOG_I(TAG, "╔════════════════════════════════════════╗");
  LOG_I(TAG, "║   Phase 5: Actuator System            ║");
  LOG_I(TAG, "╚════════════════════════════════════════╝");

  if (!safetyController.begin()) {
    LOG_E(TAG, "Safety Controller initialization failed!");
    errorTracker.trackError(ERROR_ACTUATOR_INIT_FAILED,
                            ERROR_SEVERITY_CRITICAL,
                            "SafetyController begin() failed");
  } else {
    LOG_I(TAG, "Safety Controller initialized");
  }

  if (!actuatorManager.begin()) {
    LOG_E(TAG, "Actuator Manager initialization failed!");
    errorTracker.trackError(ERROR_ACTUATOR_INIT_FAILED,
                            ERROR_SEVERITY_CRITICAL,
                            "ActuatorManager begin() failed");
  } else {
    LOG_I(TAG, "Actuator Manager initialized (waiting for MQTT configs)");
  }

  LOG_I(TAG, "╔════════════════════════════════════════╗");
  LOG_I(TAG, "║   Phase 5: Actuator System READY      ║");
  LOG_I(TAG, "╚════════════════════════════════════════╝");

  // === DIAGNOSTIK: System State nach Setup ===
  LOG_I(TAG, "=== POST-SETUP DIAGNOSTICS ===");
  LOG_I(TAG, "System State: " + String(g_system_config.current_state));
  LOG_I(TAG, "Critical Errors: " + String(errorTracker.hasCriticalErrors() ? "YES" : "NO"));
  LOG_I(TAG, "WiFi CB State: " + String(static_cast<int>(wifiManager.getCircuitBreakerState())));
  LOG_I(TAG, "Active Sensors: " + String(sensorManager.getActiveSensorCount()));
  LOG_I(TAG, "==============================");
}

// ============================================
// WATCHDOG FUNCTIONS (Industrial-Grade)
// ============================================

/**
 * @brief Feed Watchdog mit Kontext und Circuit-Breaker-Check
 * @param component_id ID der Komponente (für Diagnostics)
 * @return true wenn Feed erfolgreich, false wenn blockiert
 */
bool feedWatchdog(const char* component_id) {
  // ─────────────────────────────────────────────────────
  // 1. Circuit Breaker Check (nur in Production Mode)
  // ─────────────────────────────────────────────────────
  if (g_watchdog_config.mode == WatchdogMode::PRODUCTION) {
    // WiFi Circuit Breaker OPEN? → Service down!
    if (wifiManager.getCircuitBreakerState() == CircuitState::OPEN) {
      errorTracker.logApplicationError(
        ERROR_WATCHDOG_FEED_BLOCKED,
        "Watchdog feed blocked: WiFi Circuit Breaker OPEN"
      );
      return false;  // Feed blockiert
    }

    // MQTT Circuit Breaker OPEN?
    // ✅ FIX (2026-01-20): MQTT CB blockiert Watchdog NICHT mehr!
    // Grund: ESP kann lokal weiterarbeiten (Sensoren, Aktoren) auch wenn MQTT down ist.
    // MQTT-Ausfall ist "degraded mode", nicht "critical failure".
    // Nur WiFi CB bleibt kritisch (ohne WiFi kann ESP nichts tun).
    if (mqttClient.getCircuitBreakerState() == CircuitState::OPEN) {
      // Rate-limited warning (max once per 10 seconds)
      static unsigned long last_mqtt_cb_warning = 0;
      if (millis() - last_mqtt_cb_warning > 10000) {
        last_mqtt_cb_warning = millis();
        LOG_W(TAG, "MQTT Circuit Breaker OPEN - running in degraded mode");
      }
      // Continue with watchdog feed - don't block!
    }

    // Critical Errors?
    if (errorTracker.hasCriticalErrors()) {
      errorTracker.logApplicationError(
        ERROR_WATCHDOG_FEED_BLOCKED_CRITICAL,
        "Watchdog feed blocked: Critical errors active"
      );
      return false;
    }

    // System State Check
    if (g_system_config.current_state == STATE_ERROR) {
      LOG_W(TAG, "Watchdog feed BLOCKED: System in STATE_ERROR");
      return false;  // Error-State → Watchdog-Feed blockiert
    }
  }

  // ─────────────────────────────────────────────────────
  // 2. Feed Watchdog
  // ─────────────────────────────────────────────────────
  #ifndef WOKWI_SIMULATION
  esp_task_wdt_reset();
  #endif

  // ─────────────────────────────────────────────────────
  // 3. Update Diagnostics
  // ─────────────────────────────────────────────────────
  g_watchdog_diagnostics.last_feed_time = millis();
  g_watchdog_diagnostics.last_feed_component = component_id;
  g_watchdog_diagnostics.feed_count++;

  return true;
}

/**
 * @brief Handle Watchdog Timeout (wird in loop() aufgerufen)
 */
void handleWatchdogTimeout() {
  if (!g_watchdog_timeout_flag) return;

  // ─────────────────────────────────────────────────────
  // 1. Track Critical Error
  // ─────────────────────────────────────────────────────
  errorTracker.trackError(
    ERROR_WATCHDOG_TIMEOUT,
    ERROR_SEVERITY_CRITICAL,
    "Watchdog timeout detected"
  );

  // ─────────────────────────────────────────────────────
  // 2. Sammle Diagnostic Info
  // ─────────────────────────────────────────────────────
  WatchdogDiagnostics diag;
  diag.timestamp = millis();
  diag.system_state = g_system_config.current_state;
  diag.last_feed_component = g_watchdog_diagnostics.last_feed_component;
  diag.last_feed_time = g_watchdog_diagnostics.last_feed_time;
  diag.wifi_breaker_state = wifiManager.getCircuitBreakerState();
  diag.mqtt_breaker_state = mqttClient.getCircuitBreakerState();
  diag.error_count = errorTracker.getErrorCount();
  diag.heap_free = ESP.getFreeHeap();

  // ─────────────────────────────────────────────────────
  // 3. Speichere in NVS (für Post-Reboot-Analyse)
  // ─────────────────────────────────────────────────────
  // TODO: Implement after StorageManager integration
  // storageManager.saveWatchdogDiagnostics(diag);

  // ─────────────────────────────────────────────────────
  // 4. Health Snapshot (MQTT-Publish wenn möglich)
  // ─────────────────────────────────────────────────────
  if (mqttClient.isConnected()) {
    healthMonitor.publishSnapshot();
  }

  // ─────────────────────────────────────────────────────
  // 5. Mode-Specific Action
  // ─────────────────────────────────────────────────────
  if (g_watchdog_config.mode == WatchdogMode::PRODUCTION) {
    // Production: Panic wird automatisch triggern (panic=true)
    LOG_C(TAG, "Production Mode Watchdog Timeout → ESP will reset");
  } else {
    // Provisioning: Kein Panic, nur Log
    LOG_W(TAG, "Provisioning Mode Watchdog Timeout → Manual reset available");

    // Blinke LED als Signal
    for (int i = 0; i < 5; i++) {
      digitalWrite(LED_PIN, HIGH);
      delay(100);
      digitalWrite(LED_PIN, LOW);
      delay(100);
    }
  }

  g_watchdog_timeout_flag = false;
}

/**
 * @brief Get Watchdog timeout count in last 24 hours
 * @return Anzahl der Watchdog-Timeouts in letzten 24h
 */
uint8_t getWatchdogCountLast24h() {
  // TODO: Implement after StorageManager integration
  // Read from NVS and count timeouts in last 24h
  return 0;
}

// ============================================
// LOOP - Phase 2 Communication Monitoring + Phase 4/5 Operations
// ============================================
void loop() {
  // === DIAGNOSTIK: First Loop Entry ===
  static bool first_loop_logged = false;
  if (!first_loop_logged) {
    LOG_I(TAG, "=== FIRST LOOP ITERATION ===");
    LOG_I(TAG, "Entering loop() for the first time");
    LOG_I(TAG, "System State: " + String(g_system_config.current_state));
    LOG_I(TAG, "Critical Errors: " + String(errorTracker.hasCriticalErrors() ? "YES" : "NO"));
    first_loop_logged = true;
  }

  // === LOOP TRACING (Debug Blockade) ===
  static uint32_t loop_count = 0;
  loop_count++;
  LOG_D(TAG, "LOOP[" + String(loop_count) + "] START");

  // ─────────────────────────────────────────────────────
  // WATCHDOG FEED (Industrial-Grade)
  // ─────────────────────────────────────────────────────
  static unsigned long last_feed_time = 0;

  if (g_watchdog_config.mode != WatchdogMode::WDT_DISABLED) {
    unsigned long feed_interval = g_watchdog_config.feed_interval_ms;
    if (millis() - last_feed_time >= feed_interval) {
      if (feedWatchdog("MAIN_LOOP")) {
        last_feed_time = millis();
        // Feed successful
      } else {
        // Feed blocked → Watchdog wird timeout
        // Error wird getrackt in feedWatchdog()
      }
    }
  }
  LOG_D(TAG, "LOOP[" + String(loop_count) + "] WATCHDOG_FEED OK");

  // ─────────────────────────────────────────────────────
  // WATCHDOG TIMEOUT HANDLER
  // ─────────────────────────────────────────────────────
  handleWatchdogTimeout();
  LOG_D(TAG, "LOOP[" + String(loop_count) + "] WATCHDOG_TIMEOUT_HANDLER OK");
  // ═══════════════════════════════════════════════════
  // ✅ FIX #1: STATE_SAFE_MODE_PROVISIONING HANDLING
  // ═══════════════════════════════════════════════════
  // ESP ist im Provisioning Safe-Mode (nach 3× Timeout)
  // → AP-Mode läuft, HTTP-Server wartet auf Konfiguration
  // → Keine WiFi/MQTT-Verbindung aktiv
  if (g_system_config.current_state == STATE_SAFE_MODE_PROVISIONING) {
    // ProvisionManager.loop() für HTTP-Request-Handling
    provisionManager.loop();

    // ═══════════════════════════════════════════════════════════════════════════
    // CRITICAL FIX: Check if config was NEWLY received via HTTP, not just exists
    // ═══════════════════════════════════════════════════════════════════════════
    // Problem: Previous check used (g_wifi_config.configured && g_wifi_config.ssid.length() > 0)
    // This was TRUE immediately at boot if config was loaded from NVS, causing
    // instant reboot → infinite loop.
    //
    // Solution: Use provisionManager.isConfigReceived() which is only TRUE after
    // HTTP POST /provision successfully saves new config in this session.
    // ═══════════════════════════════════════════════════════════════════════════
    if (provisionManager.isConfigReceived()) {
      // Config wurde via HTTP API empfangen und gespeichert (in this session)!
      LOG_I(TAG, "╔════════════════════════════════════════╗");
      LOG_I(TAG, "║  ✅ KONFIGURATION EMPFANGEN!          ║");
      LOG_I(TAG, "╚════════════════════════════════════════╝");

      // Reload config to get fresh values
      configManager.loadWiFiConfig(g_wifi_config);
      LOG_I(TAG, "WiFi SSID: " + g_wifi_config.ssid);
      LOG_I(TAG, "Rebooting to apply configuration...");
      delay(2000);
      ESP.restart();  // ✅ Reboot → Normal-Flow startet
    }

    delay(10);  // Provisioning Mode: No Watchdog active, no reset needed
    return;     // ✅ Skip normal loop logic
  }

  // ═══════════════════════════════════════════════════
  // ✅ PHASE 1: STATE_PENDING_APPROVAL HANDLING
  // ═══════════════════════════════════════════════════
  // ESP ist registriert aber noch nicht vom Server genehmigt
  // → WiFi/MQTT Verbindung halten (Heartbeats senden)
  // → Sensoren/Aktoren NICHT aktivieren
  // → Warte auf Approval-Message vom Server
  if (g_system_config.current_state == STATE_PENDING_APPROVAL) {
    // Maintain communication (send heartbeats, receive approval)
    wifiManager.loop();
    mqttClient.loop();
    healthMonitor.loop();  // Publish diagnostics (includes system_state)

    // Note: Initial approval check happens in setup() (Phase 1E)
    // When approved via Frontend, server updates device status in DB
    // On next ESP reboot, configManager.isDeviceApproved() returns true
    // → Transition to STATE_OPERATIONAL happens automatically

    delay(100);  // Slower loop in pending mode (no sensor/actuator work)
    return;      // ✅ Skip sensor/actuator operations
  }

  // ═══════════════════════════════════════════════════
  // PHASE 2: BOOT-COUNTER RESET (After 60s stable operation)
  // ═══════════════════════════════════════════════════
  static bool boot_count_reset = false;
  if (!boot_count_reset && millis() > 60000 && g_system_config.boot_count > 1) {
    g_system_config.boot_count = 0;
    g_system_config.last_boot_time = 0;  // Reset timestamp too
    configManager.saveSystemConfig(g_system_config);
    boot_count_reset = true;
    LOG_I(TAG, "Boot counter reset - stable operation confirmed");
  }

  // Phase 2: Communication monitoring (with Circuit Breaker - Phase 6+)
  LOG_D(TAG, "LOOP[" + String(loop_count) + "] WIFI_START");
  wifiManager.loop();      // Monitor WiFi connection (Circuit Breaker integrated)
  LOG_D(TAG, "LOOP[" + String(loop_count) + "] WIFI OK");
  LOG_D(TAG, "LOOP[" + String(loop_count) + "] MQTT_START");
  mqttClient.loop();       // Process MQTT messages + heartbeat (Circuit Breaker integrated)
  LOG_D(TAG, "LOOP[" + String(loop_count) + "] MQTT OK");

  // ═══════════════════════════════════════════════════
  // MQTT PERSISTENT FAILURE DETECTION → PROVISIONING RECOVERY
  // ═══════════════════════════════════════════════════
  // If MQTT Circuit Breaker stays OPEN for 5 minutes continuously,
  // the server/broker config is likely wrong. Trigger portal recovery.
  // This covers the case where MQTT connected initially but then
  // permanently lost the broker (e.g. server IP changed, broker down).
  {
    static const unsigned long MQTT_PERSISTENT_FAILURE_TIMEOUT_MS = 300000;  // 5 minutes
    static unsigned long mqtt_failure_start = 0;

    if (!mqttClient.isConnected() && mqttClient.getCircuitBreakerState() == CircuitState::OPEN) {
      if (mqtt_failure_start == 0) {
        mqtt_failure_start = millis();
        LOG_W(TAG, "MQTT persistent failure timer started (5 min to recovery)");
      } else if (millis() - mqtt_failure_start > MQTT_PERSISTENT_FAILURE_TIMEOUT_MS) {
        LOG_C(TAG, "╔════════════════════════════════════════╗");
        LOG_C(TAG, "║  MQTT PERSISTENT FAILURE (5 min)       ║");
        LOG_C(TAG, "║  Triggering Provisioning Recovery...   ║");
        LOG_C(TAG, "╚════════════════════════════════════════╝");

        g_system_config.current_state = STATE_SAFE_MODE_PROVISIONING;
        g_system_config.safe_mode_reason = "MQTT persistent failure (5 min Circuit Breaker OPEN)";
        configManager.saveSystemConfig(g_system_config);

        // Clear faulty config so user must re-enter
        configManager.resetWiFiConfig();
        LOG_I(TAG, "Configuration cleared - rebooting to provisioning...");
        delay(2000);
        ESP.restart();
      }
    } else {
      // MQTT is connected or Circuit Breaker recovered → reset timer
      if (mqtt_failure_start != 0) {
        LOG_I(TAG, "MQTT recovered - persistent failure timer reset");
        mqtt_failure_start = 0;
      }
    }
  }

  // Phase 4: Sensor measurements
  LOG_D(TAG, "LOOP[" + String(loop_count) + "] SENSOR_START");
  sensorManager.performAllMeasurements();
  LOG_D(TAG, "LOOP[" + String(loop_count) + "] SENSOR OK");

  // Phase 5: Actuator maintenance
  LOG_D(TAG, "LOOP[" + String(loop_count) + "] ACTUATOR_START");
  actuatorManager.processActuatorLoops();
  static unsigned long last_actuator_status = 0;
  if (millis() - last_actuator_status > 30000) {
    actuatorManager.publishAllActuatorStatus();
    last_actuator_status = millis();
  }
  LOG_D(TAG, "LOOP[" + String(loop_count) + "] ACTUATOR OK");

  // ============================================
  // PHASE 7: HEALTH MONITORING (automatic via HealthMonitor)
  // ============================================
  LOG_D(TAG, "LOOP[" + String(loop_count) + "] HEALTH_START");
  healthMonitor.loop();  // Publishes automatically if needed
  LOG_D(TAG, "LOOP[" + String(loop_count) + "] HEALTH OK");

  LOG_D(TAG, "LOOP[" + String(loop_count) + "] END");
  delay(10);  // Small delay (gives CPU to scheduler)
}

// ============================================
// MQTT MESSAGE HANDLERS (PHASE 4)
// ============================================
void handleSensorConfig(const String& payload) {
  LOG_I(TAG, "Handling sensor configuration from MQTT");

  DynamicJsonDocument doc(4096);
  DeserializationError error = deserializeJson(doc, payload);
  if (error) {
    String message = "Failed to parse sensor config JSON: " + String(error.c_str());
    LOG_E(TAG, message);
    ConfigResponseBuilder::publishError(
        ConfigType::SENSOR, ConfigErrorCode::JSON_PARSE_ERROR, message);
    return;
  }

  // Phase 3: Extract correlation_id for event tracking
  String correlationId = "";
  if (doc.containsKey("correlation_id")) {
    correlationId = doc["correlation_id"].as<String>();
  }

  JsonArray sensors = doc["sensors"].as<JsonArray>();
  if (sensors.isNull()) {
    String message = "Sensor config missing 'sensors' array";
    LOG_E(TAG, message);
    ConfigResponseBuilder::publishError(
        ConfigType::SENSOR, ConfigErrorCode::MISSING_FIELD, message,
        JsonVariantConst(), correlationId);
    return;
  }

  size_t total = sensors.size();
  if (total == 0) {
    String message = "Sensor config array is empty";
    LOG_W(TAG, message);
    ConfigResponseBuilder::publishError(
        ConfigType::SENSOR, ConfigErrorCode::MISSING_FIELD, message,
        JsonVariantConst(), correlationId);
    return;
  }

  // Phase 4: Collect failures for aggregated response
  std::vector<ConfigFailureItem> failures;
  failures.reserve(min(total, (size_t)MAX_CONFIG_FAILURES));
  uint8_t success_count = 0;

  for (JsonObject sensorObj : sensors) {
    ConfigFailureItem failure;
    if (parseAndConfigureSensorWithTracking(sensorObj, &failure)) {
      success_count++;
    } else {
      // Only store up to MAX_CONFIG_FAILURES
      if (failures.size() < MAX_CONFIG_FAILURES) {
        failures.push_back(failure);
      }
    }
  }

  // Phase 4: Use publishWithFailures for aggregated response
  uint8_t fail_count = static_cast<uint8_t>(total - success_count);
  ConfigResponseBuilder::publishWithFailures(
      ConfigType::SENSOR,
      success_count,
      fail_count,
      failures,
      correlationId);
}

// ============================================
// PHASE 4: SENSOR PARSING WITH FAILURE TRACKING
// ============================================
// New version that fills failure details instead of publishing immediately
bool parseAndConfigureSensorWithTracking(const JsonObjectConst& sensor_obj, ConfigFailureItem* failure_out) {
  SensorConfig config;

  // Helper macro to set failure and return false
  #define SET_FAILURE_AND_RETURN(gpio_val, err_code, err_name, detail_msg) \
    if (failure_out) { \
      failure_out->type = "sensor"; \
      failure_out->gpio = gpio_val; \
      failure_out->error_code = err_code; \
      failure_out->error_name = err_name; \
      failure_out->detail = detail_msg; \
    } \
    return false;

  if (!sensor_obj.containsKey("gpio")) {
    LOG_E(TAG, "Sensor config missing required field 'gpio'");
    SET_FAILURE_AND_RETURN(0, ERROR_CONFIG_MISSING, "MISSING_FIELD", "Missing required field 'gpio'");
  }

  int gpio_value = 255;
  if (!JsonHelpers::extractInt(sensor_obj, "gpio", gpio_value)) {
    LOG_E(TAG, "Sensor field 'gpio' must be an integer");
    SET_FAILURE_AND_RETURN(0, ERROR_CONFIG_INVALID, "TYPE_MISMATCH", "Field 'gpio' must be an integer");
  }
  config.gpio = static_cast<uint8_t>(gpio_value);

  if (!sensor_obj.containsKey("sensor_type")) {
    LOG_E(TAG, "Sensor config missing required field 'sensor_type'");
    SET_FAILURE_AND_RETURN(config.gpio, ERROR_CONFIG_MISSING, "MISSING_FIELD", "Missing required field 'sensor_type'");
  }
  if (!JsonHelpers::extractString(sensor_obj, "sensor_type", config.sensor_type)) {
    LOG_E(TAG, "Sensor field 'sensor_type' must be a string");
    SET_FAILURE_AND_RETURN(config.gpio, ERROR_CONFIG_INVALID, "TYPE_MISMATCH", "Field 'sensor_type' must be a string");
  }
  // Normalize sensor_type to lowercase (Defense-in-Depth)
  // Server may send "DS18B20" or "SHT31" - direct indexOf() checks need lowercase
  config.sensor_type.toLowerCase();

  if (!sensor_obj.containsKey("sensor_name")) {
    LOG_E(TAG, "Sensor config missing required field 'sensor_name'");
    SET_FAILURE_AND_RETURN(config.gpio, ERROR_CONFIG_MISSING, "MISSING_FIELD", "Missing required field 'sensor_name'");
  }
  if (!JsonHelpers::extractString(sensor_obj, "sensor_name", config.sensor_name)) {
    LOG_E(TAG, "Sensor field 'sensor_name' must be a string");
    SET_FAILURE_AND_RETURN(config.gpio, ERROR_CONFIG_INVALID, "TYPE_MISMATCH", "Field 'sensor_name' must be a string");
  }

  JsonHelpers::extractString(sensor_obj, "subzone_id", config.subzone_id, "");

  // BUG-ONEWIRE-CONFIG-001 FIX: Extract OneWire ROM-Code for OneWire sensors
  // Server sends 16 hex chars (e.g. "28FF641E8D3C0C79") for DS18B20
  // Empty string for non-OneWire sensors is valid (analog, I2C, etc.)
  JsonHelpers::extractString(sensor_obj, "onewire_address", config.onewire_address, "");

  bool bool_value = true;
  if (JsonHelpers::extractBool(sensor_obj, "active", bool_value, true)) {
    config.active = bool_value;
  } else {
    config.active = true;
  }

  if (JsonHelpers::extractBool(sensor_obj, "raw_mode", bool_value, true)) {
    config.raw_mode = bool_value;
  } else {
    config.raw_mode = true;
  }

  // ✅ Phase 2C: Operating Mode Parsing
  String mode_str;
  if (JsonHelpers::extractString(sensor_obj, "operating_mode", mode_str, "continuous")) {
    if (mode_str == "continuous" || mode_str == "on_demand" ||
        mode_str == "paused" || mode_str == "scheduled") {
      config.operating_mode = mode_str;
    } else {
      LOG_W(TAG, "Invalid operating_mode '" + mode_str + "', defaulting to 'continuous'");
      config.operating_mode = "continuous";
    }
  } else {
    config.operating_mode = "continuous";
  }

  // ✅ Phase 2C: Measurement Interval Parsing
  int interval_seconds = 30;
  if (JsonHelpers::extractInt(sensor_obj, "measurement_interval_seconds", interval_seconds, 30)) {
    if (interval_seconds < 1) {
      LOG_W(TAG, "measurement_interval_seconds too low, using minimum 1s");
      interval_seconds = 1;
    } else if (interval_seconds > 300) {
      LOG_W(TAG, "measurement_interval_seconds too high, using maximum 300s");
      interval_seconds = 300;
    }
  }
  config.measurement_interval_ms = static_cast<uint32_t>(interval_seconds) * 1000;

  LOG_D(TAG, "Sensor GPIO " + String(config.gpio) + " config: mode=" +
            config.operating_mode + ", interval=" + String(interval_seconds) + "s");

  if (!configManager.validateSensorConfig(config)) {
    LOG_E(TAG, "Sensor validation failed for GPIO " + String(config.gpio));
    // Check if it's a GPIO conflict using GPIOManager
    // Bus-sharing owners (e.g. "bus/onewire/4") are NOT conflicts for compatible sensors
    String pin_owner = gpioManager.getPinOwner(config.gpio);
    String pin_component = gpioManager.getPinComponent(config.gpio);
    String detail;
    if (pin_owner.length() > 0 && !pin_owner.startsWith("bus/")) {
      // Exclusive conflict: Pin owned by non-bus component (sensor, actuator, system)
      detail = "GPIO " + String(config.gpio) + " reserved by " + pin_owner;
      if (pin_component.length() > 0) {
        detail += " (" + pin_component + ")";
      }
      SET_FAILURE_AND_RETURN(config.gpio, ERROR_GPIO_CONFLICT, "GPIO_CONFLICT", detail);
    } else {
      SET_FAILURE_AND_RETURN(config.gpio, ERROR_CONFIG_INVALID, "VALIDATION_FAILED",
                             "Sensor validation failed for GPIO " + String(config.gpio));
    }
  }

  if (!config.active) {
    if (!sensorManager.removeSensor(config.gpio)) {
      LOG_W(TAG, "Sensor removal requested, but no sensor on GPIO " + String(config.gpio));
    }
    if (!configManager.removeSensorConfig(config.gpio)) {
      LOG_E(TAG, "Failed to remove sensor config from NVS for GPIO " + String(config.gpio));
      SET_FAILURE_AND_RETURN(config.gpio, ERROR_NVS_WRITE_FAILED, "NVS_WRITE_FAILED",
                             "Failed to remove sensor config from NVS");
    }
    LOG_I(TAG, "Sensor removed: GPIO " + String(config.gpio));
    return true;
  }

  if (!sensorManager.configureSensor(config)) {
    LOG_E(TAG, "Failed to configure sensor on GPIO " + String(config.gpio));
    // Check for GPIO conflict (distinguish exclusive vs bus-sharing conflicts)
    String pin_owner = gpioManager.getPinOwner(config.gpio);
    String pin_component = gpioManager.getPinComponent(config.gpio);
    if (pin_owner.length() > 0 && !pin_owner.startsWith("bus/")) {
      // Exclusive conflict: Pin owned by non-bus component (sensor, actuator, system)
      String detail = "GPIO " + String(config.gpio) + " already used by " + pin_owner;
      if (pin_component.length() > 0) {
        detail += " (" + pin_component + ")";
      }
      SET_FAILURE_AND_RETURN(config.gpio, ERROR_GPIO_CONFLICT, "GPIO_CONFLICT", detail);
    } else {
      // Either no owner or bus owner (bus-sharing scenario) - report actual config failure
      SET_FAILURE_AND_RETURN(config.gpio, ERROR_SENSOR_INIT_FAILED, "CONFIG_FAILED",
                             "Failed to configure sensor on GPIO " + String(config.gpio));
    }
  }

  if (!configManager.saveSensorConfig(config)) {
    LOG_E(TAG, "Failed to save sensor config to NVS for GPIO " + String(config.gpio));
    SET_FAILURE_AND_RETURN(config.gpio, ERROR_NVS_WRITE_FAILED, "NVS_WRITE_FAILED",
                           "Failed to save sensor config to NVS");
  }

  LOG_I(TAG, "Sensor configured: GPIO " + String(config.gpio) + " (" + config.sensor_type + ")");

  #undef SET_FAILURE_AND_RETURN
  return true;
}

// Legacy version for backward compatibility (calls new version)
bool parseAndConfigureSensor(const JsonObjectConst& sensor_obj) {
  ConfigFailureItem failure;
  bool success = parseAndConfigureSensorWithTracking(sensor_obj, &failure);

  // For backward compatibility: publish individual error if failed
  if (!success) {
    ConfigResponseBuilder::publishError(
        ConfigType::SENSOR,
        static_cast<ConfigErrorCode>(failure.error_code),
        failure.detail);
  }

  return success;
}

void handleActuatorConfig(const String& payload) {
  LOG_I(TAG, "Handling actuator configuration from MQTT");

  // Phase 3: Extract correlation_id for event tracking
  String correlationId = "";
  DynamicJsonDocument tempDoc(256);
  if (deserializeJson(tempDoc, payload) == DeserializationError::Ok) {
    if (tempDoc.containsKey("correlation_id")) {
      correlationId = tempDoc["correlation_id"].as<String>();
    }
  }

  actuatorManager.handleActuatorConfig(payload, correlationId);
}

// ============================================
// SENSOR COMMAND HANDLER (PHASE 2C - On-Demand)
// ============================================
/**
 * Handles sensor commands (e.g., manual measurement trigger)
 *
 * Topic: kaiser/{id}/esp/{esp_id}/sensor/{gpio}/command
 * Payload: {"command": "measure", "request_id": "req_12345"}
 */
void handleSensorCommand(const String& topic, const String& payload) {
  LOG_I(TAG, "Sensor command received: " + topic);

  // Extract GPIO from topic
  // Format: kaiser/{id}/esp/{esp_id}/sensor/{gpio}/command
  int sensor_pos = topic.indexOf("/sensor/");
  int command_pos = topic.lastIndexOf("/command");

  if (sensor_pos < 0 || command_pos < 0 || sensor_pos >= command_pos) {
    LOG_E(TAG, "Invalid sensor command topic format: " + topic);
    return;
  }

  // Extract GPIO string between "/sensor/" and "/command"
  String gpio_str = topic.substring(sensor_pos + 8, command_pos);
  uint8_t gpio = static_cast<uint8_t>(gpio_str.toInt());

  if (gpio == 0 && gpio_str != "0") {
    LOG_E(TAG, "Failed to parse GPIO from topic: " + topic);
    return;
  }

  // Parse JSON payload
  DynamicJsonDocument doc(256);
  DeserializationError error = deserializeJson(doc, payload);

  if (error) {
    LOG_E(TAG, "Failed to parse sensor command JSON: " + String(error.c_str()));
    return;
  }

  String command = doc["command"] | "";
  String request_id = doc["request_id"] | "";

  if (command == "measure") {
    LOG_I(TAG, "Manual measurement requested for GPIO " + String(gpio));

    bool success = sensorManager.triggerManualMeasurement(gpio);

    // Send response if request_id was provided
    if (request_id.length() > 0) {
      String response_topic = String(TopicBuilder::buildSensorResponseTopic(gpio));
      DynamicJsonDocument response(256);
      response["request_id"] = request_id;
      response["gpio"] = gpio;
      response["command"] = "measure";
      response["success"] = success;
      response["ts"] = timeManager.getUnixTimestamp();
      response["seq"] = mqttClient.getNextSeq();

      String response_payload;
      serializeJson(response, response_payload);
      mqttClient.publish(response_topic, response_payload, 1);

      LOG_D(TAG, "Sensor command response sent: " + response_payload);
    }

    if (success) {
      LOG_I(TAG, "Manual measurement completed for GPIO " + String(gpio));
    } else {
      LOG_W(TAG, "Manual measurement failed for GPIO " + String(gpio));
    }
  } else {
    LOG_W(TAG, "Unknown sensor command: " + command);
  }
}


