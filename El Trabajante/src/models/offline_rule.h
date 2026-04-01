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

struct OfflineRule {
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
};
