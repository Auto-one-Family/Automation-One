// ============================================
// SAFETY-RTOS M3: Communication Task (Core 0)
// ============================================
// All network I/O formerly in loop() lives here.
// loop() is minimal after this phase (vTaskDelay only).
// ============================================

#include "communication_task.h"
#include "publish_queue.h"

#include <Arduino.h>
#include <WiFi.h>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>
#include <freertos/portmacro.h>

#include "../utils/logger.h"
#include "../utils/watchdog_storage.h"
#include "../services/communication/wifi_manager.h"
#include "../services/communication/mqtt_client.h"
#include "../services/config/config_manager.h"
#include "../services/provisioning/provision_manager.h"
#include "../services/actuator/actuator_manager.h"
#include "../models/system_types.h"
#include "../models/config_types.h"
#include "../error_handling/circuit_breaker.h"

static const char* COMM_TAG = "COMM";

static TaskHandle_t s_comm_task_handle = NULL;

static const uint32_t    COMM_TASK_STACK_SIZE = 6144;
static const UBaseType_t COMM_TASK_PRIORITY   = 3;    // Below Safety-Task (5)
static const BaseType_t  COMM_TASK_CORE       = 0;    // PRO_CPU (WiFi-Stack co-located)

static const unsigned long ACTUATOR_STATUS_INTERVAL_MS      = 30000;
static const unsigned long PORTAL_OPEN_DEBOUNCE_MS           = 30000;
static const unsigned long MQTT_PERSISTENT_FAILURE_TIMEOUT_MS = 300000;  // 5 minutes

// ─── External state from main.cpp ──────────────────────────────────────
extern SystemConfig g_system_config;
extern WiFiConfig   g_wifi_config;
extern bool         portal_open_due_to_disconnect_;

// ─── External functions from main.cpp ──────────────────────────────────
extern void handleWatchdogTimeout();

// ============================================
// STATIC HELPER: Provisioning Mode Handler
// ============================================
// Mirrors the STATE_SAFE_MODE_PROVISIONING branch that was in loop().
static void handleProvisioningState() {
    // Keep HTTP portal alive
    provisionManager.loop();

    // Portal open due to MQTT disconnect: run WiFi+MQTT, check for reconnect success
    if (portal_open_due_to_disconnect_) {
        wifiManager.loop();
        mqttClient.loop();
#ifndef MQTT_USE_PUBSUBCLIENT
        mqttClient.processPublishQueue();
#endif

        if (mqttClient.isConnected() && mqttClient.isRegistrationConfirmed()) {
            LOG_I(COMM_TAG, "Reconnect erfolgreich — Portal wird geschlossen");
            provisionManager.stop();
            portal_open_due_to_disconnect_ = false;
            WiFi.mode(WIFI_STA);  // Back to STA-only
            g_system_config.current_state = STATE_OPERATIONAL;
            g_system_config.safe_mode_reason = "";
            configManager.saveSystemConfig(g_system_config);
        }
    }

    // Config received via HTTP → reload + reboot
    if (provisionManager.isConfigReceived()) {
        LOG_I(COMM_TAG, "╔════════════════════════════════════════╗");
        LOG_I(COMM_TAG, "║  ✅ KONFIGURATION EMPFANGEN!          ║");
        LOG_I(COMM_TAG, "╚════════════════════════════════════════╝");
        configManager.loadWiFiConfig(g_wifi_config);
        LOG_I(COMM_TAG, "WiFi SSID: " + g_wifi_config.ssid);
        LOG_I(COMM_TAG, "Rebooting to apply configuration...");
        delay(2000);
        ESP.restart();
    }
}

// ============================================
// STATIC HELPER: WiFi Disconnect Debounce
// ============================================
// Opens config portal after 30 s of continuous MQTT disconnect in OPERATIONAL state.
// Mirrors the debounce block that was in loop().
static void handleWifiDisconnectDebounce() {
    static unsigned long disconnect_start = 0;

    if (g_system_config.current_state == STATE_OPERATIONAL && !mqttClient.isConnected()) {
        if (disconnect_start == 0) {
            disconnect_start = millis();
        } else if (millis() - disconnect_start > PORTAL_OPEN_DEBOUNCE_MS
                   && !portal_open_due_to_disconnect_) {
            LOG_I(COMM_TAG, "Config-Portal geoeffnet (Server getrennt), Reconnect laeuft im Hintergrund");
            g_system_config.current_state = STATE_SAFE_MODE_PROVISIONING;
            g_system_config.safe_mode_reason =
                "MQTT disconnected (" + String(PORTAL_OPEN_DEBOUNCE_MS / 1000) + "s)";
            configManager.saveSystemConfig(g_system_config);
            if (provisionManager.startAPModeForReconfig()) {
                portal_open_due_to_disconnect_ = true;
            }
            disconnect_start = 0;
        }
    } else {
        disconnect_start = 0;
    }
}

// ============================================
// STATIC HELPER: MQTT Persistent Failure (5 min)
// ============================================
// If MQTT Circuit Breaker stays OPEN for 5 minutes, open config portal as fallback.
// Mirrors the persistent-failure block that was in loop().
static void handleMqttPersistentFailure() {
    static unsigned long mqtt_failure_start = 0;

    if (!mqttClient.isConnected()
        && mqttClient.getCircuitBreakerState() == CircuitState::OPEN) {
        if (mqtt_failure_start == 0) {
            mqtt_failure_start = millis();
            LOG_W(COMM_TAG, "MQTT persistent failure timer started (5 min to recovery)");
        } else if (millis() - mqtt_failure_start > MQTT_PERSISTENT_FAILURE_TIMEOUT_MS) {
            if (!portal_open_due_to_disconnect_) {
                LOG_C(COMM_TAG, "╔════════════════════════════════════════╗");
                LOG_C(COMM_TAG, "║  MQTT PERSISTENT FAILURE (5 min)       ║");
                LOG_C(COMM_TAG, "║  Config-Portal oeffnen...              ║");
                LOG_C(COMM_TAG, "╚════════════════════════════════════════╝");
                g_system_config.current_state = STATE_SAFE_MODE_PROVISIONING;
                g_system_config.safe_mode_reason =
                    "MQTT persistent failure (5 min Circuit Breaker OPEN)";
                configManager.saveSystemConfig(g_system_config);
                if (provisionManager.startAPModeForReconfig()) {
                    portal_open_due_to_disconnect_ = true;
                }
            }
            mqtt_failure_start = 0;
        }
    } else {
        if (mqtt_failure_start != 0) {
            LOG_I(COMM_TAG, "MQTT recovered - persistent failure timer reset");
            mqtt_failure_start = 0;
        }
    }
}

// ============================================
// STATIC HELPER: Periodic Actuator Status Publish
// ============================================
static void handleActuatorStatusPublish() {
    static unsigned long last_actuator_status = 0;
    if (millis() - last_actuator_status > ACTUATOR_STATUS_INTERVAL_MS) {
        actuatorManager.publishAllActuatorStatus();
        last_actuator_status = millis();
    }
}

// ============================================
// STATIC HELPER: Heap Monitoring (every 60 s)
// ============================================
// SAFETY-RTOS M4: Detect memory leaks from queue/mutex overhead or large config payloads.
static void handleHeapMonitoring() {
    static unsigned long last_heap_log = 0;
    static const unsigned long HEAP_LOG_INTERVAL_MS = 60000;
    if (millis() - last_heap_log > HEAP_LOG_INTERVAL_MS) {
        last_heap_log = millis();
        String extra;
        if (s_comm_task_handle != NULL) {
            UBaseType_t hwm = uxTaskGetStackHighWaterMark(s_comm_task_handle);
            extra = ", stack HWM=" + String((uint32_t)(hwm * (uint32_t)sizeof(StackType_t))) + " B";
        }
        LOG_I(COMM_TAG, "[COMM] Heap free=" + String(ESP.getFreeHeap()) +
              " B, min=" + String(ESP.getMinFreeHeap()) + " B" + extra);
    }
}

// ============================================
// STATIC HELPER: Boot Counter Reset (once after 60 s stable)
// ============================================
static void handleBootCounterReset() {
    static bool done = false;
    if (!done && millis() > 60000 && g_system_config.boot_count > 1) {
        g_system_config.boot_count    = 0;
        g_system_config.last_boot_time = 0;
        configManager.saveSystemConfig(g_system_config);
        done = true;
        LOG_I(COMM_TAG, "Boot counter reset - stable operation confirmed");
    }
}

// ============================================
// TASK FUNCTION
// ============================================
void communicationTaskFunction(void* param) {
    (void)param;
    LOG_I(COMM_TAG, "[COMM] Communication task running on core " + String(xPortGetCoreID()));

    for (;;) {
        // One-shot: finalise watchdog boot record after stable uptime
        watchdogStorageTryFinalizeBootRecord();

        // WDT timeout recovery (diagnostics snapshot + MQTT alert)
        handleWatchdogTimeout();

        // ── Provisioning Mode ──────────────────────────────────────────
        if (g_system_config.current_state == STATE_SAFE_MODE_PROVISIONING) {
            handleProvisioningState();
            vTaskDelay(pdMS_TO_TICKS(50));
            continue;
        }

        // ── Pending Approval Mode ──────────────────────────────────────
        // Only keep WiFi+MQTT alive; sensors/actuators remain inactive.
        if (g_system_config.current_state == STATE_PENDING_APPROVAL) {
            wifiManager.loop();
            mqttClient.loop();
#ifndef MQTT_USE_PUBSUBCLIENT
            // Check registration gate timeout independently — no other publish() calls are
            // made in PENDING_APPROVAL, so the inline timeout in publish() would never fire.
            mqttClient.checkRegistrationTimeout();
            mqttClient.processPublishQueue();
#endif
            vTaskDelay(pdMS_TO_TICKS(100));  // Slower tick — no sensor/actuator work
            continue;
        }

        // ── Operational Mode ───────────────────────────────────────────
        wifiManager.loop();
        mqttClient.loop();  // ESP-IDF path: handles timeManager (NTP) + heartbeat publish
#ifndef MQTT_USE_PUBSUBCLIENT
        // Check registration gate timeout independently — fallback if no non-heartbeat
        // publish() call has been made yet (e.g. no sensor data during first 10 s).
        mqttClient.checkRegistrationTimeout();
        mqttClient.processPublishQueue();  // Drain Core 1 → Core 0 publish queue
#endif

        handleBootCounterReset();
        handleWifiDisconnectDebounce();
        handleMqttPersistentFailure();
        handleActuatorStatusPublish();
        handleHeapMonitoring();

        vTaskDelay(pdMS_TO_TICKS(50));
    }
}

// ============================================
// createCommunicationTask
// ============================================
void createCommunicationTask() {
    xTaskCreatePinnedToCore(
        communicationTaskFunction,
        "CommTask",
        COMM_TASK_STACK_SIZE,
        NULL,
        COMM_TASK_PRIORITY,
        &s_comm_task_handle,
        COMM_TASK_CORE
    );
}
