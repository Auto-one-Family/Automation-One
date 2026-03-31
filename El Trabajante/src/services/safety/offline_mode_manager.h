#pragma once
#include <Arduino.h>
#include <ArduinoJson.h>
#include "../../models/offline_rule.h"

// ============================================
// SAFETY-P4: Offline Mode Manager
// ============================================
// TM-authorized exception to Server-Centric rule.
// Precedent: SAFETY-P1 setAllActuatorsToSafeState.
//
// Implements a 4-state state machine for connectivity-aware
// offline hysteresis control. Activates after 30s without
// server ACK and evaluates rules every 5s.

enum class OfflineMode : uint8_t {
    ONLINE         = 0,  // Normal operation — server connected
    DISCONNECTED   = 1,  // Connectivity lost — 30s grace timer running
    OFFLINE_ACTIVE = 2,  // Grace period expired — local rules active
    RECONNECTING   = 3   // Server reconnected — rules still active until sync
};

// Grace period before offline rules activate after disconnect
static constexpr unsigned long OFFLINE_ACTIVATION_DELAY_MS = 30000UL;

class OfflineModeManager {
public:
    // ============================================
    // SINGLETON PATTERN
    // ============================================
    static OfflineModeManager& getInstance();

    OfflineModeManager(const OfflineModeManager&) = delete;
    OfflineModeManager& operator=(const OfflineModeManager&) = delete;

    // ============================================
    // STATE-MACHINE HOOKS
    // ============================================
    // Called when MQTT disconnects (Mechanism B hook + P4 delay timer start)
    void onDisconnect();

    // Called when MQTT reconnects successfully
    void onReconnect();

    // Called when heartbeat ACK received from server
    void onServerAckReceived();

    // Called on emergency stop — resets to ONLINE, clears all rule states
    void onEmergencyStop();

    // ============================================
    // LOOP-INTEGRATION
    // ============================================
    // Check whether 30s delay has elapsed → transition to OFFLINE_ACTIVE
    void checkDelayTimer();

    // Evaluate all enabled offline rules (call every 5s when isOfflineActive())
    void evaluateOfflineRules();

    // ============================================
    // CONFIG
    // ============================================
    // Parse "offline_rules" array from config-push payload
    void parseOfflineRules(JsonObject obj);

    // Load persisted rules from NVS namespace "offline"
    void loadOfflineRulesFromNVS();

    // ============================================
    // SERVER-OVERRIDE
    // ============================================
    // Mark actuator as server-controlled while offline — skip rule for that actuator
    void setServerOverride(uint8_t actuator_gpio);

    // ============================================
    // STATUS
    // ============================================
    bool isOfflineActive() const {
        return mode_ == OfflineMode::OFFLINE_ACTIVE || mode_ == OfflineMode::RECONNECTING;
    }
    OfflineMode getMode() const { return mode_; }
    uint8_t getOfflineRuleCount() const { return offline_rule_count_; }

private:
    OfflineModeManager() = default;
    ~OfflineModeManager() = default;

    // NVS persistence helpers
    void saveOfflineRulesToNVS();
    void activateOfflineMode();
    void deactivateOfflineMode();

    // State
    OfflineMode    mode_                  = OfflineMode::ONLINE;
    unsigned long  disconnect_timestamp_ms_ = 0;

    // Rules storage
    OfflineRule    offline_rules_[MAX_OFFLINE_RULES];
    OfflineRule    offline_rules_shadow_[MAX_OFFLINE_RULES];
    uint8_t        offline_rule_count_    = 0;
    uint8_t        shadow_rule_count_     = 0;
};

// ============================================
// GLOBAL INSTANCE ACCESS
// ============================================
extern OfflineModeManager& offlineModeManager;
