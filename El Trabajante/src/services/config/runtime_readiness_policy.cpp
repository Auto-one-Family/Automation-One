#include "runtime_readiness_policy.h"

RuntimeReadinessPolicy defaultRuntimeReadinessPolicy() {
    RuntimeReadinessPolicy policy{};
    policy.profile = RuntimeReadinessProfile::SENSOR_REQUIRED;
    policy.require_actuator = true;
    policy.require_offline_rules = true;
    return policy;
}

const char* runtimeReadinessProfileName(RuntimeReadinessProfile profile) {
    switch (profile) {
        case RuntimeReadinessProfile::SENSOR_OPTIONAL:
            return "sensor_optional";
        case RuntimeReadinessProfile::SENSOR_REQUIRED:
        default:
            return "sensor_required";
    }
}

RuntimeReadinessDecision evaluateRuntimeReadiness(const RuntimeReadinessSnapshot& snapshot,
                                                  const RuntimeReadinessPolicy& policy) {
    RuntimeReadinessDecision decision{};
    decision.policy = policy;
    decision.snapshot = snapshot;
    decision.ready = true;
    decision.decision_code = "CONFIG_PENDING_EXIT_READY";

    const bool sensors_required = policy.profile == RuntimeReadinessProfile::SENSOR_REQUIRED;
    if (sensors_required && snapshot.sensor_count == 0) {
        decision.ready = false;
        decision.decision_code = "MISSING_SENSORS";
        return decision;
    }
    if (policy.require_actuator && snapshot.actuator_count == 0) {
        decision.ready = false;
        decision.decision_code = "MISSING_ACTUATORS";
        return decision;
    }
    if (policy.require_offline_rules && snapshot.offline_rule_count == 0) {
        decision.ready = false;
        decision.decision_code = "MISSING_OFFLINE_RULES";
        return decision;
    }
    return decision;
}
