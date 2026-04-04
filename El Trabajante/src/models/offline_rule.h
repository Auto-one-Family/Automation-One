#pragma once
#include <cstdint>
#include <cmath>

// ============================================
// SAFETY-P4: Offline Hysteresis Rules
// ============================================
// TM-authorized exception to Server-Centric rule.
// Precedent: SAFETY-P1 setAllActuatorsToSafeState.
//
// These rules activate ONLY when server connectivity is lost
// and a 30s grace period has elapsed. Binary actuator control
// only — no PWM, no business logic.

static const uint8_t MAX_OFFLINE_RULES = 8;

enum class OfflineRuleTimezone : uint8_t {
    UTC = 0,
    EUROPE_BERLIN = 1,
};

struct OfflineRule {
    // --- Existing fields (DO NOT REORDER — NVS blob byte layout) ---
    bool    enabled;
    uint8_t actuator_gpio;
    uint8_t sensor_gpio;
    char    sensor_value_type[24];  // e.g. "sht31_temperature", "bmp280_temp"
    float   activate_below;         // Heating mode: activate when val < threshold
    float   deactivate_above;       // Heating mode: deactivate when val > threshold
    float   activate_above;         // Cooling mode: activate when val > threshold
    float   deactivate_below;       // Cooling mode: deactivate when val < threshold
    bool    is_active;              // Current actuator state driven by this rule
    bool    server_override;        // Server commanded while offline → skip rule

    // --- New fields (NVS blob v1+, APPEND ONLY - do not insert before this line) ---
    bool    time_filter_enabled;    // Has this rule a time window?
    uint8_t start_hour;             // 0-23 in rule timezone
    uint8_t start_minute;           // 0–59
    uint8_t end_hour;               // 0-24 (24 = midnight exclusive)
    uint8_t end_minute;             // 0–59
    uint8_t days_of_week_mask;      // Bitmask: bit0=Sun .. bit6=Sat (0x7F=all days)
    uint8_t timezone_mode;          // OfflineRuleTimezone
};

static_assert(sizeof(OfflineRule) <= 64, "OfflineRule struct exceeds 64 bytes");
