#include "offline_mode_manager.h"
#include <cmath>
#include <cstring>
#include "../../utils/logger.h"
#include "../../services/config/storage_manager.h"
#include "../../services/sensor/sensor_manager.h"
#include "../../services/actuator/actuator_manager.h"

static const char* TAG = "SAFETY-P4";

// ============================================
// SINGLETON IMPLEMENTATION
// ============================================
OfflineModeManager& OfflineModeManager::getInstance() {
    static OfflineModeManager instance;
    return instance;
}

OfflineModeManager& offlineModeManager = OfflineModeManager::getInstance();

// ============================================
// STATE-MACHINE HOOKS
// ============================================

void OfflineModeManager::onDisconnect() {
    if (mode_ == OfflineMode::ONLINE) {
        mode_ = OfflineMode::DISCONNECTED;
        disconnect_timestamp_ms_ = millis();
        LOG_W(TAG, "[SAFETY-P4] Disconnect detected - 30s grace timer started");
    }
}

void OfflineModeManager::onReconnect() {
    if (mode_ == OfflineMode::OFFLINE_ACTIVE) {
        mode_ = OfflineMode::RECONNECTING;
        LOG_I(TAG, "[SAFETY-P4] Reconnected - waiting for server ACK to return ONLINE");
    } else if (mode_ == OfflineMode::DISCONNECTED) {
        // Reconnected before grace period expired — no rules were active
        mode_ = OfflineMode::ONLINE;
        disconnect_timestamp_ms_ = 0;
        LOG_I(TAG, "[SAFETY-P4] Reconnected during grace period - back ONLINE");
    }
}

void OfflineModeManager::onServerAckReceived() {
    if (mode_ == OfflineMode::RECONNECTING || mode_ == OfflineMode::OFFLINE_ACTIVE) {
        // Server confirmed → disable offline rules, clear overrides
        // OFFLINE_ACTIVE: handles the case where MQTT broker stayed connected but
        // the server process restarted — onMQTTConnect() was never called, so mode
        // never transitioned to RECONNECTING. The ACK is still the authoritative
        // signal that the server is back online and P4 rules must stop.
        deactivateOfflineMode();
    } else if (mode_ == OfflineMode::DISCONNECTED) {
        // ACK received before grace period — cancel timer
        mode_ = OfflineMode::ONLINE;
        disconnect_timestamp_ms_ = 0;
        LOG_D(TAG, "[SAFETY-P4] Server ACK during grace period - timer cancelled");
    }
}

void OfflineModeManager::onEmergencyStop() {
    LOG_W(TAG, "[SAFETY-P4] Emergency stop - offline mode cleared");
    mode_ = OfflineMode::ONLINE;
    disconnect_timestamp_ms_ = 0;

    // Reset all rule states
    for (uint8_t i = 0; i < offline_rule_count_; i++) {
        offline_rules_[i].is_active      = false;
        offline_rules_[i].server_override = false;
    }
}

// ============================================
// LOOP-INTEGRATION
// ============================================

void OfflineModeManager::checkDelayTimer() {
    if (mode_ != OfflineMode::DISCONNECTED) {
        return;
    }

    if (disconnect_timestamp_ms_ == 0) {
        return;
    }

    if (millis() - disconnect_timestamp_ms_ >= OFFLINE_ACTIVATION_DELAY_MS) {
        activateOfflineMode();
    }
}

// Defense-in-Depth guard: calibration-required sensors store only ADC raw values
// (0-4095) in the ValueCache — applyLocalConversion() returns (float)raw_value for
// these types. Offline rule thresholds are in physical units (pH, mS/cm, %).
// Comparing ADC raw vs. physical threshold is meaningless and potentially dangerous.
// Server-side filter (config_builder.py) is the primary defense; this guard handles
// stale NVS data, manual config manipulation, or server-side bugs.
static bool requiresCalibration(const char* sensor_value_type) {
    // Canonical types — server normalizes aliases before building the config push,
    // but stale NVS data from pre-normalization firmware may still carry alias strings
    // such as "soil_moisture". Include all known aliases as defense-in-depth.
    return (strcmp(sensor_value_type, "ph") == 0 ||
            strcmp(sensor_value_type, "ec") == 0 ||
            strcmp(sensor_value_type, "moisture") == 0 ||
            strcmp(sensor_value_type, "soil_moisture") == 0);
}

void OfflineModeManager::evaluateOfflineRules() {
    if (offline_rule_count_ == 0) {
        return;
    }

    LOG_D(TAG, String("[SAFETY-P4] Evaluating ") + String(offline_rule_count_) + " offline rules");

    // Boot-time summary: log once how many rules are filtered due to calibration requirement
    static bool first_evaluation = true;
    if (first_evaluation) {
        first_evaluation = false;
        uint8_t filtered = 0;
        for (uint8_t i = 0; i < offline_rule_count_; i++) {
            if (requiresCalibration(offline_rules_[i].sensor_value_type)) filtered++;
        }
        if (filtered > 0) {
            LOG_W(TAG, String("[SAFETY-P4] ") + String(filtered) + " of " +
                       String(offline_rule_count_) + " rules filtered (calibration-required sensors)."
                       " Associated actuators remain in safe state (OFF).");
        }
    }

    for (uint8_t i = 0; i < offline_rule_count_; i++) {
        OfflineRule& rule = offline_rules_[i];

        if (!rule.enabled || rule.server_override) {
            continue;
        }

        // Guard: ph/ec/moisture rules cannot be evaluated without server calibration.
        // If the rule was active (actuator ON), force it OFF exactly once.
        // If already inactive, silently skip — no log spam.
        if (requiresCalibration(rule.sensor_value_type)) {
            if (rule.is_active) {
                rule.is_active = false;
                actuatorManager.controlActuatorBinary(rule.actuator_gpio, false);
                LOG_W(TAG, String("[SAFETY-P4] Rule ") + String(i) + ": sensor '" +
                           String(rule.sensor_value_type) +
                           "' requires calibration - forcing actuator GPIO " +
                           String(rule.actuator_gpio) + " OFF (safe state)");
            }
            continue;
        }

        float val = sensorManager.getSensorValue(rule.sensor_gpio, rule.sensor_value_type);

        if (isnan(val)) {
            // Sensor stale or unavailable — skip, keep current state
            LOG_D(TAG, String("[SAFETY-P4] Rule ") + String(i) +
                       ": sensor GPIO " + String(rule.sensor_gpio) +
                       " '" + String(rule.sensor_value_type) + "' stale - skipping");
            continue;
        }

        bool new_state = rule.is_active;

        // Heating mode: activate_below / deactivate_above
        bool has_heating = (rule.activate_below != 0.0f || rule.deactivate_above != 0.0f);
        if (has_heating) {
            if (!rule.is_active && val < rule.activate_below) {
                new_state = true;
            }
            if (rule.is_active && val > rule.deactivate_above) {
                new_state = false;
            }
        }

        // Cooling mode: activate_above / deactivate_below
        bool has_cooling = (rule.activate_above != 0.0f || rule.deactivate_below != 0.0f);
        if (has_cooling) {
            if (!rule.is_active && val > rule.activate_above) {
                new_state = true;
            }
            if (rule.is_active && val < rule.deactivate_below) {
                new_state = false;
            }
        }

        if (new_state != rule.is_active) {
            rule.is_active = new_state;
            actuatorManager.controlActuatorBinary(rule.actuator_gpio, new_state);
            LOG_I(TAG, String("[SAFETY-P4] Rule ") + String(i) +
                       ": GPIO " + String(rule.actuator_gpio) +
                       " -> " + (new_state ? "ON" : "OFF") +
                       " (sensor GPIO " + String(rule.sensor_gpio) +
                       " = " + String(val));

            // Option B: write only the changed is_active key to NVS.
            // Full saveOfflineRulesToNVS() is too stack-heavy for the Safety-Task —
            // it opens the namespace and rewrites all 8+ keys per rule.
            // Here we open/write/close for ONE key only, on state changes (infrequent).
            char state_key[16];
            snprintf(state_key, sizeof(state_key), "ofr_%d_state", i);
            if (storageManager.beginNamespace("offline", false)) {
                storageManager.putUInt8(state_key, rule.is_active ? 1 : 0);
                storageManager.endNamespace();
            }
        }
    }
}

// ============================================
// CONFIG
// ============================================

void OfflineModeManager::parseOfflineRules(JsonObject obj) {
    if (!obj.containsKey("offline_rules")) {
        // Field absent — keep existing rules
        return;
    }

    JsonArray rules = obj["offline_rules"].as<JsonArray>();
    if (rules.isNull()) {
        return;
    }

    if (rules.size() == 0) {
        // Explicit empty array → clear all rules
        offline_rule_count_ = 0;
        if (storageManager.beginNamespace("offline", false)) {
            storageManager.clearNamespace();
            storageManager.endNamespace();
        }
        LOG_I(TAG, "[CONFIG] Received 0 offline rules - cleared");
        return;
    }

    uint8_t count = static_cast<uint8_t>(
        rules.size() < MAX_OFFLINE_RULES ? rules.size() : MAX_OFFLINE_RULES
    );

    for (uint8_t i = 0; i < count; i++) {
        JsonObject r = rules[i];
        offline_rules_[i].enabled        = true;
        offline_rules_[i].actuator_gpio  = r["actuator_gpio"] | static_cast<uint8_t>(255);
        offline_rules_[i].sensor_gpio    = r["sensor_gpio"] | static_cast<uint8_t>(255);
        const char* svt                  = r["sensor_value_type"] | "";
        strncpy(offline_rules_[i].sensor_value_type, svt, 23);
        offline_rules_[i].sensor_value_type[23] = '\0';
        offline_rules_[i].activate_below    = r["activate_below"] | 0.0f;
        offline_rules_[i].deactivate_above  = r["deactivate_above"] | 0.0f;
        offline_rules_[i].activate_above    = r["activate_above"] | 0.0f;
        offline_rules_[i].deactivate_below  = r["deactivate_below"] | 0.0f;
        // is_active: use server-provided state if present, otherwise preserve existing
        // value (from NVS load at boot). Prevents config push from resetting a running
        // hysteresis cycle — especially important when server reconnects after a reboot.
        if (r.containsKey("current_state_active")) {
            offline_rules_[i].is_active = r["current_state_active"].as<bool>();
            LOG_D(TAG, String("[CONFIG] Rule ") + String(i) + ": is_active=" +
                       (offline_rules_[i].is_active ? "true" : "false") + " (from server push)");
        }
        // else: preserve existing value (NVS-loaded or false on first boot)
        offline_rules_[i].server_override   = false;
    }

    offline_rule_count_ = count;
    LOG_I(TAG, "[CONFIG] Received " + String(count) + " offline rules");
    saveOfflineRulesToNVS();
}

void OfflineModeManager::loadOfflineRulesFromNVS() {
    if (!storageManager.beginNamespace("offline", true)) {
        offline_rule_count_ = 0;
        LOG_D(TAG, "[CONFIG] NVS namespace 'offline' not found - no rules loaded");
        return;
    }

    offline_rule_count_ = storageManager.getUInt8("ofr_count", 0);
    if (offline_rule_count_ > MAX_OFFLINE_RULES) {
        offline_rule_count_ = MAX_OFFLINE_RULES;
    }

    char key[16];
    for (uint8_t i = 0; i < offline_rule_count_; i++) {
        snprintf(key, sizeof(key), "ofr_%d_en", i);
        offline_rules_[i].enabled = storageManager.getUInt8(key, 0) != 0;

        snprintf(key, sizeof(key), "ofr_%d_agpio", i);
        offline_rules_[i].actuator_gpio = storageManager.getUInt8(key, 255);

        snprintf(key, sizeof(key), "ofr_%d_sgpio", i);
        offline_rules_[i].sensor_gpio = storageManager.getUInt8(key, 255);

        snprintf(key, sizeof(key), "ofr_%d_svtyp", i);
        String svtyp = storageManager.getStringObj(key, "");
        strncpy(offline_rules_[i].sensor_value_type, svtyp.c_str(), 23);
        offline_rules_[i].sensor_value_type[23] = '\0';

        snprintf(key, sizeof(key), "ofr_%d_actb", i);
        offline_rules_[i].activate_below = storageManager.getFloat(key, 0.0f);

        snprintf(key, sizeof(key), "ofr_%d_deaa", i);
        offline_rules_[i].deactivate_above = storageManager.getFloat(key, 0.0f);

        snprintf(key, sizeof(key), "ofr_%d_acta", i);
        offline_rules_[i].activate_above = storageManager.getFloat(key, 0.0f);

        snprintf(key, sizeof(key), "ofr_%d_deab", i);
        offline_rules_[i].deactivate_below = storageManager.getFloat(key, 0.0f);

        snprintf(key, sizeof(key), "ofr_%d_state", i);
        if (storageManager.keyExists(key)) {
            offline_rules_[i].is_active = storageManager.getUInt8(key, 0) != 0;
            LOG_I(TAG, String("[CONFIG] NVS Rule ") + String(i) +
                       ": is_active=" + (offline_rules_[i].is_active ? "true" : "false") +
                       " (from NVS)");
        } else {
            offline_rules_[i].is_active = false;
            LOG_D(TAG, String("[CONFIG] NVS Rule ") + String(i) +
                       ": is_active=false (no NVS key, default)");
        }
        offline_rules_[i].server_override = false;
    }

    storageManager.endNamespace();

    // Initialize shadow copy for change-detection (includes is_active)
    memcpy(offline_rules_shadow_, offline_rules_, sizeof(OfflineRule) * offline_rule_count_);
    shadow_rule_count_ = offline_rule_count_;

    LOG_I(TAG, "[CONFIG] Loaded " + String(offline_rule_count_) + " offline rules from NVS");
}

// ============================================
// SERVER-OVERRIDE
// ============================================

void OfflineModeManager::setServerOverride(uint8_t actuator_gpio) {
    for (uint8_t i = 0; i < offline_rule_count_; i++) {
        if (offline_rules_[i].actuator_gpio == actuator_gpio) {
            if (!offline_rules_[i].server_override) {  // Guard: log only on first override
                offline_rules_[i].server_override = true;
                LOG_I(TAG, "[SAFETY-P4] Server override set for actuator GPIO " + String(actuator_gpio));
            }
        }
    }
}

// ============================================
// PRIVATE HELPERS
// ============================================

void OfflineModeManager::activateOfflineMode() {
    mode_ = OfflineMode::OFFLINE_ACTIVE;

    // Initialize is_active flags from actual hardware state.
    // Without this, all rules start at is_active=false regardless of the real actuator
    // state at the moment of broker disconnect. If the server had an actuator ON when
    // the broker disconnected, the first P4 evaluation cycle would see is_active=false,
    // evaluate both thresholds as "not yet active", and potentially command the actuator
    // to a wrong state before any sensor reading confirms the need.
    if (offline_rule_count_ > 0 && actuatorManager.isInitialized()) {
        for (uint8_t i = 0; i < offline_rule_count_; i++) {
            if (!offline_rules_[i].enabled || offline_rules_[i].actuator_gpio == 255) {
                continue;
            }
            ActuatorConfig cfg = actuatorManager.getActuatorConfig(offline_rules_[i].actuator_gpio);

            // Extended diagnostic: log all three state sources simultaneously.
            // Distinguishes root causes:
            //   Ursache A — cfg.current_state wrong (driver getConfig() bug)
            //   Ursache B — race condition (cfg.current_state has stale value)
            //   Ursache C — cfg.gpio==255 (GPIO mismatch, actuator not in ActuatorManager)
            LOG_I(TAG, String("[SAFETY-P4-DIAG] Rule ") + String(i) +
                       ": rule.actuator_gpio=" + String(offline_rules_[i].actuator_gpio) +
                       ", cfg.gpio=" + String(cfg.gpio) + " (255=not found)" +
                       ", cfg.current_state=" + (cfg.current_state ? "ON" : "OFF") +
                       ", cfg.default_state=" + (cfg.default_state ? "ON" : "OFF") +
                       ", digitalRead=" + String(digitalRead(offline_rules_[i].actuator_gpio)));

            if (cfg.gpio != 255) {
                offline_rules_[i].is_active = cfg.current_state;
            } else {
                // Ursache C fallback: actuator GPIO not found in ActuatorManager.
                // Read hardware pin directly — physical pin state cannot lie.
                int pin_val = digitalRead(offline_rules_[i].actuator_gpio);
                offline_rules_[i].is_active = (pin_val == HIGH);
                LOG_W(TAG, String("[SAFETY-P4] Rule ") + String(i) +
                           ": actuator GPIO " + String(offline_rules_[i].actuator_gpio) +
                           " not found in ActuatorManager — digitalRead=" +
                           String(pin_val) + " used as fallback");
            }

            LOG_I(TAG, String("[SAFETY-P4] Rule ") + String(i) +
                       ": actuator GPIO " + String(offline_rules_[i].actuator_gpio) +
                       " is_active initialized from hardware state -> " +
                       (offline_rules_[i].is_active ? "ON" : "OFF"));
        }
    }

    LOG_W(TAG, "[SAFETY-P4] Offline mode ACTIVE - " +
               String(offline_rule_count_) + " local rules enabled");
    if (offline_rule_count_ == 0) {
        // Fix 1a/1b should already have set safe state on disconnect,
        // but confirm here as defense-in-depth.
        if (actuatorManager.isInitialized()) {
            actuatorManager.setAllActuatorsToSafeState();
        }
        LOG_W(TAG, "[SAFETY-P4] OFFLINE_ACTIVE with 0 rules — confirming safe state");
    }
    // If rules > 0: nothing — Safety-Task evaluates in <5s automatically
}

void OfflineModeManager::deactivateOfflineMode() {
    mode_ = OfflineMode::ONLINE;
    disconnect_timestamp_ms_ = 0;

    // Reset transient rule state — rules will re-evaluate when offline again
    for (uint8_t i = 0; i < offline_rule_count_; i++) {
        offline_rules_[i].is_active      = false;
        offline_rules_[i].server_override = false;
    }

    // Persist is_active=false so a subsequent power-cycle doesn't reload stale state.
    // Called from Communication-Task (Core 0) via onServerAckReceived() — stack is fine.
    // Uses saveOfflineRulesToNVS() (full write) because all states reset at once.
    saveOfflineRulesToNVS();

    LOG_I(TAG, "[SAFETY-P4] Offline mode DEACTIVATED - back to server control");
}

void OfflineModeManager::saveOfflineRulesToNVS() {
    // Change-detection: skip NVS write if nothing changed
    if (offline_rule_count_ == shadow_rule_count_ &&
        memcmp(offline_rules_, offline_rules_shadow_,
               sizeof(OfflineRule) * offline_rule_count_) == 0) {
        return;
    }

    if (!storageManager.beginNamespace("offline", false)) {
        LOG_E(TAG, "[CONFIG] Failed to open NVS namespace 'offline' for write");
        return;
    }

    storageManager.putUInt8("ofr_count", offline_rule_count_);

    char key[16];
    for (uint8_t i = 0; i < offline_rule_count_; i++) {
        snprintf(key, sizeof(key), "ofr_%d_en", i);
        storageManager.putUInt8(key, offline_rules_[i].enabled ? 1 : 0);

        snprintf(key, sizeof(key), "ofr_%d_agpio", i);
        storageManager.putUInt8(key, offline_rules_[i].actuator_gpio);

        snprintf(key, sizeof(key), "ofr_%d_sgpio", i);
        storageManager.putUInt8(key, offline_rules_[i].sensor_gpio);

        snprintf(key, sizeof(key), "ofr_%d_svtyp", i);
        storageManager.putString(key, offline_rules_[i].sensor_value_type);

        snprintf(key, sizeof(key), "ofr_%d_actb", i);
        storageManager.putFloat(key, offline_rules_[i].activate_below);

        snprintf(key, sizeof(key), "ofr_%d_deaa", i);
        storageManager.putFloat(key, offline_rules_[i].deactivate_above);

        snprintf(key, sizeof(key), "ofr_%d_acta", i);
        storageManager.putFloat(key, offline_rules_[i].activate_above);

        snprintf(key, sizeof(key), "ofr_%d_deab", i);
        storageManager.putFloat(key, offline_rules_[i].deactivate_below);

        // Option A: is_active persisted as part of the full save/load cycle.
        // Written only when saveOfflineRulesToNVS() detects a change (memcmp guard).
        // Wear protection: hysteresis transitions are infrequent (< ~10/day per rule).
        snprintf(key, sizeof(key), "ofr_%d_state", i);
        storageManager.putUInt8(key, offline_rules_[i].is_active ? 1 : 0);
    }

    storageManager.endNamespace();

    // Update shadow copy (includes is_active so next memcmp is accurate)
    memcpy(offline_rules_shadow_, offline_rules_, sizeof(OfflineRule) * offline_rule_count_);
    shadow_rule_count_ = offline_rule_count_;

    LOG_I(TAG, "[CONFIG] Saved " + String(offline_rule_count_) + " offline rules to NVS");
}
