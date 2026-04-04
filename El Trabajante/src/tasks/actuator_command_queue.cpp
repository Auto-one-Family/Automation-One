#include "actuator_command_queue.h"
#include <cstring>

#include "../services/actuator/actuator_manager.h"
#include "../services/communication/mqtt_client.h"
#include "../utils/logger.h"
#include "../error_handling/error_tracker.h"
#include "../models/error_codes.h"
#include "../models/system_types.h"
#include "command_admission.h"

static const char* ACT_Q_TAG = "SYNC";

QueueHandle_t g_actuator_cmd_queue = NULL;
extern SystemConfig g_system_config;

void initActuatorCommandQueue() {
    g_actuator_cmd_queue = xQueueCreate(ACTUATOR_CMD_QUEUE_SIZE, sizeof(ActuatorMqttQueueItem));
    if (g_actuator_cmd_queue == NULL) {
        LOG_E(ACT_Q_TAG, "[SYNC] Failed to create actuator command queue");
    }
}

bool queueActuatorCommand(const char* topic, const char* payload, const IntentMetadata* metadata) {
    if (g_actuator_cmd_queue == NULL) return false;
    ActuatorMqttQueueItem cmd;
    strncpy(cmd.topic, topic, sizeof(cmd.topic) - 1);
    cmd.topic[sizeof(cmd.topic) - 1] = '\0';
    strncpy(cmd.payload, payload, sizeof(cmd.payload) - 1);
    cmd.payload[sizeof(cmd.payload) - 1] = '\0';
    IntentMetadata fallback_meta = extractIntentMetadataFromPayload(payload, "cmd");
    cmd.metadata = fallback_meta;
    if (metadata != nullptr) {
        cmd.metadata = *metadata;
    }
    bool recovery_intent = isRecoveryIntentAllowed(topic, payload);
    BaseType_t queued = recovery_intent
                        ? xQueueSendToFront(g_actuator_cmd_queue, &cmd, pdMS_TO_TICKS(20))
                        : xQueueSend(g_actuator_cmd_queue, &cmd, 0);
    if (queued != pdTRUE) {
        LOG_W(ACT_Q_TAG, "[SYNC] Actuator command queue full — dropping: " + String(cmd.topic));
        errorTracker.logApplicationError(ERROR_TASK_QUEUE_FULL, "Actuator command queue full");
        return false;
    }
    if (recovery_intent) {
        LOG_I(ACT_Q_TAG, "[SYNC] Recovery actuator intent prioritized to queue front");
    }
    return true;
}

void flushActuatorCommandQueue() {
    if (g_actuator_cmd_queue == NULL) return;
    ActuatorMqttQueueItem dropped;
    uint16_t dropped_count = 0;
    while (xQueueReceive(g_actuator_cmd_queue, &dropped, 0) == pdTRUE) {
        publishIntentOutcome("command",
                             dropped.metadata,
                             "expired",
                             "SAFETY_QUEUE_FLUSHED",
                             "Dropped during emergency queue flush",
                             false);
        dropped_count++;
    }
    if (dropped_count > 0) {
        LOG_W(ACT_Q_TAG, "[SYNC] Flushed actuator command queue after emergency (" +
                         String(dropped_count) + " dropped)");
    }
}

void processActuatorCommandQueue(uint8_t max_items) {
    if (g_actuator_cmd_queue == NULL) return;
    ActuatorMqttQueueItem cmd;
    uint8_t processed = 0;
    uint32_t epoch = getSafetyEpoch();
    while (processed < max_items && xQueueReceive(g_actuator_cmd_queue, &cmd, 0) == pdTRUE) {
        IntentInvalidationReason invalidation_reason =
            getIntentInvalidationReason(cmd.metadata, epoch);
        if (invalidation_reason != IntentInvalidationReason::NONE &&
            !isRecoveryIntentAllowed(cmd.topic, cmd.payload)) {
            publishIntentOutcome("command",
                                 cmd.metadata,
                                 "expired",
                                 invalidation_reason == IntentInvalidationReason::SAFETY_EPOCH_INVALIDATED
                                     ? "SAFETY_EPOCH_INVALIDATED"
                                     : "TTL_EXPIRED",
                                 invalidation_reason == IntentInvalidationReason::SAFETY_EPOCH_INVALIDATED
                                     ? "Command invalidated by safety epoch update"
                                     : "Command TTL expired before execution",
                                 false);
            processed++;
            continue;
        }
        CommandAdmissionContext admission_context{
            mqttClient.isRegistrationConfirmed(),
            g_system_config.current_state == STATE_CONFIG_PENDING_AFTER_RESET,
            g_system_config.current_state == STATE_SAFE_MODE ||
                g_system_config.current_state == STATE_SAFE_MODE_PROVISIONING ||
                g_system_config.current_state == STATE_ERROR,
            g_system_config.current_state == STATE_SAFE_MODE,
            isRecoveryIntentAllowed(cmd.topic, cmd.payload),
            nullptr
        };
        CommandAdmissionDecision admission = shouldAcceptCommand(CommandSubtype::ACTUATOR, admission_context);
        if (!admission.accepted) {
            publishIntentOutcome("command",
                                 cmd.metadata,
                                 "rejected",
                                 admission.code,
                                 String("Actuator command blocked (reason_code=") + admission.reason_code + ")",
                                 false);
            processed++;
            continue;
        }
        bool ok = actuatorManager.handleActuatorCommand(String(cmd.topic), String(cmd.payload));
        publishIntentOutcome("command",
                             cmd.metadata,
                             ok ? "applied" : "failed",
                             ok ? "NONE" : "EXECUTE_FAIL",
                             ok ? "Actuator command applied" : "Actuator command execution failed",
                             !ok);
        processed++;
    }
}
