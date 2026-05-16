#include "actuator_command_queue.h"
#include <cstring>

#include "../services/actuator/actuator_manager.h"
#include "../services/communication/mqtt_client.h"
#include "../utils/logger.h"
#include "../error_handling/error_tracker.h"
#include "../models/error_codes.h"
#include "../models/system_types.h"
#include "command_admission.h"
#include "publish_queue.h"

static const char* ACT_Q_TAG = "SYNC";
static constexpr unsigned long ACT_QUEUE_ACK_STALE_MS = 10000UL;
// Under stale ACK + publish pressure, executing commands too quickly can create
// a response/outcome storm and destabilize reconnect recovery.
static constexpr unsigned long ACT_QUEUE_STALE_PRESSURE_MIN_PROGRESS_MS = 1000UL;

QueueHandle_t g_actuator_cmd_queue = NULL;
extern SystemConfig g_system_config;

static bool reserveSlotForActuatorCommand(const ActuatorMqttQueueItem& incoming_cmd,
                                          bool incoming_recovery_intent) {
    if (g_actuator_cmd_queue == NULL) {
        return false;
    }

    const UBaseType_t queued = uxQueueMessagesWaiting(g_actuator_cmd_queue);
    if (queued == 0) {
        return false;
    }

    bool evicted = false;
    ActuatorMqttQueueItem item;
    for (UBaseType_t i = 0; i < queued; ++i) {
        if (xQueueReceive(g_actuator_cmd_queue, &item, 0) != pdTRUE) {
            break;
        }

        const bool item_recovery = isRecoveryIntentAllowed(item.topic, item.payload);
        const bool same_command_class = strcmp(item.topic, incoming_cmd.topic) == 0;
        const bool evict_candidate = !item_recovery &&
                                     (incoming_recovery_intent || same_command_class);
        if (!evicted && evict_candidate) {
            evicted = true;
            LOG_W(ACT_Q_TAG, String("[SYNC] Evicted queued actuator command under pressure: ") +
                             String(item.topic));
            continue;
        }

        if (xQueueSend(g_actuator_cmd_queue, &item, 0) != pdTRUE) {
            LOG_W(ACT_Q_TAG, "[SYNC] Failed to restore actuator queue item during reserve-slot");
        }
    }

    if (!evicted) {
        return false;
    }

    BaseType_t enqueue_result = incoming_recovery_intent
                                    ? xQueueSendToFront(g_actuator_cmd_queue,
                                                        &incoming_cmd,
                                                        pdMS_TO_TICKS(10))
                                    : xQueueSend(g_actuator_cmd_queue, &incoming_cmd, 0);
    return enqueue_result == pdTRUE;
}

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
    cmd.enqueued_ms = millis();
    bool recovery_intent = isRecoveryIntentAllowed(topic, payload);
    BaseType_t queued = recovery_intent
                        ? xQueueSendToFront(g_actuator_cmd_queue, &cmd, pdMS_TO_TICKS(20))
                        : xQueueSend(g_actuator_cmd_queue, &cmd, 0);
    if (queued != pdTRUE) {
        if (reserveSlotForActuatorCommand(cmd, recovery_intent)) {
            LOG_W(ACT_Q_TAG, String("[SYNC] Actuator queue full -> reserved slot for latest command: ") +
                             String(cmd.topic) +
                             " recovery=" + String(recovery_intent ? 1 : 0));
            return true;
        }
        LOG_W(ACT_Q_TAG, "[SYNC] Actuator command queue full — dropping: " + String(cmd.topic));
        errorTracker.logApplicationError(ERROR_TASK_QUEUE_FULL, "Actuator command queue full");
        return false;
    }
    if (recovery_intent) {
        LOG_I(ACT_Q_TAG, "[SYNC] Recovery actuator intent prioritized to queue front");
    }
    static unsigned long s_last_enqueue_dbg_ms = 0;
    const unsigned long now_ms = millis();
    if (s_last_enqueue_dbg_ms == 0UL || (now_ms - s_last_enqueue_dbg_ms) >= 250UL) {
        s_last_enqueue_dbg_ms = now_ms;
        const UBaseType_t depth_now = uxQueueMessagesWaiting(g_actuator_cmd_queue);
        // #region agent log
        LOG_W(ACT_Q_TAG, String("[DBG5126ae] actuator queue enqueue ") +
                         "depth=" + String((uint32_t)depth_now) +
                         " payload_len=" + String((uint32_t)strlen(cmd.payload)) +
                         " mqtt_connected=" + String(mqttClient.isConnected() ? 1 : 0) +
                         " reg_confirmed=" + String(mqttClient.isRegistrationConfirmed() ? 1 : 0));
        // #endregion
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
    const unsigned long now_ms = millis();
    const uint32_t last_ack_ms = g_last_server_ack_ms.load();
    const bool ack_stale =
        (last_ack_ms > 0UL && now_ms > last_ack_ms &&
         (now_ms - last_ack_ms) > ACT_QUEUE_ACK_STALE_MS);
    const PublishQueuePressureStats publish_stats = getPublishQueuePressureStats();
    const bool queue_pressure_high =
        publish_stats.fill_level >= PUBLISH_QUEUE_SHED_WATERMARK;
    const bool stale_pressure_throttle_active =
        ack_stale && queue_pressure_high && mqttClient.isConnected();

    // Backpressure contract: while publish ACK is stale and publish queue is already
    // in pressure region, process actuator commands strictly one-by-one and postpone
    // non-recovery execution. This avoids executing a burst that cannot be confirmed.
    if (stale_pressure_throttle_active && max_items > 1) {
        max_items = 1;
    }

    while (processed < max_items && xQueueReceive(g_actuator_cmd_queue, &cmd, 0) == pdTRUE) {
        const bool recovery_intent = isRecoveryIntentAllowed(cmd.topic, cmd.payload);
        if (stale_pressure_throttle_active && !recovery_intent) {
            static unsigned long s_last_stale_pressure_progress_ms = 0UL;
            const unsigned long throttle_now_ms = millis();
            const bool allow_progress =
                (s_last_stale_pressure_progress_ms == 0UL) ||
                ((throttle_now_ms - s_last_stale_pressure_progress_ms) >=
                 ACT_QUEUE_STALE_PRESSURE_MIN_PROGRESS_MS);
            if (allow_progress) {
                s_last_stale_pressure_progress_ms = throttle_now_ms;
            } else {
                if (xQueueSendToFront(g_actuator_cmd_queue, &cmd, 0) != pdTRUE) {
                    LOG_W(ACT_Q_TAG, "[SYNC] Failed to requeue actuator command under ack/backpressure throttle");
                } else {
                    static unsigned long s_last_ack_throttle_log_ms = 0;
                    if (s_last_ack_throttle_log_ms == 0UL ||
                        (throttle_now_ms - s_last_ack_throttle_log_ms) >= 1000UL) {
                        s_last_ack_throttle_log_ms = throttle_now_ms;
                        LOG_W(ACT_Q_TAG, String("[DBG5126ae] actuator queue throttle ack/backpressure ") +
                                         "ack_age_ms=" + String(throttle_now_ms - last_ack_ms) +
                                         " publish_fill=" + String((uint32_t)publish_stats.fill_level) +
                                         " min_progress_ms=" + String(ACT_QUEUE_STALE_PRESSURE_MIN_PROGRESS_MS) +
                                         " cmd_topic=" + String(cmd.topic));
                    }
                }
                break;
            }
        }
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
            g_system_config.current_state == STATE_PENDING_APPROVAL,
            g_system_config.current_state == STATE_SAFE_MODE ||
                g_system_config.current_state == STATE_SAFE_MODE_PROVISIONING ||
                g_system_config.current_state == STATE_ERROR,
            g_system_config.current_state == STATE_SAFE_MODE,
            isRecoveryIntentAllowed(cmd.topic, cmd.payload),
            nullptr
        };
        CommandAdmissionDecision admission = shouldAcceptCommand(CommandSubtype::ACTUATOR, admission_context);
        if (!admission.accepted) {
            const bool suppress_rejection_outcome =
                (strcmp(admission.reason_code, "REGISTRATION_PENDING") == 0) &&
                stale_pressure_throttle_active;
            if (suppress_rejection_outcome) {
                static unsigned long s_last_reg_pending_suppress_log_ms = 0UL;
                const unsigned long suppress_now_ms = millis();
                if (s_last_reg_pending_suppress_log_ms == 0UL ||
                    (suppress_now_ms - s_last_reg_pending_suppress_log_ms) >= 1000UL) {
                    s_last_reg_pending_suppress_log_ms = suppress_now_ms;
                    LOG_W(ACT_Q_TAG, String("[DBG5126ae] suppress REGISTRATION_PENDING outcome under pressure ") +
                                     "ack_stale=" + String(ack_stale ? 1 : 0) +
                                     " publish_fill=" + String((uint32_t)publish_stats.fill_level) +
                                     " cmd_topic=" + String(cmd.topic));
                }
                processed++;
                continue;
            }
            publishIntentOutcome("command",
                                 cmd.metadata,
                                 "rejected",
                                 admission.code,
                                 String("Actuator command blocked (reason_code=") + admission.reason_code + ")",
                                 false);
            processed++;
            continue;
        }
        const unsigned long dequeue_ms = millis();
        const unsigned long queue_age_ms = (cmd.enqueued_ms > 0UL && dequeue_ms >= cmd.enqueued_ms)
                                               ? (dequeue_ms - cmd.enqueued_ms)
                                               : 0UL;
        const UBaseType_t depth_after_pop = uxQueueMessagesWaiting(g_actuator_cmd_queue);
        // #region agent log
        LOG_W(ACT_Q_TAG, String("[DBG5126ae] actuator queue dequeue ") +
                         "queue_age_ms=" + String(queue_age_ms) +
                         " depth_after_pop=" + String((uint32_t)depth_after_pop) +
                         " mqtt_connected=" + String(mqttClient.isConnected() ? 1 : 0) +
                         " reg_confirmed=" + String(mqttClient.isRegistrationConfirmed() ? 1 : 0));
        // #endregion
        const unsigned long exec_started_ms = millis();
        bool ok = actuatorManager.handleActuatorCommand(String(cmd.topic), String(cmd.payload));
        const unsigned long exec_duration_ms = millis() - exec_started_ms;
        // #region agent log
        LOG_W(ACT_Q_TAG, String("[DBG5126ae] actuator execute result ") +
                         "ok=" + String(ok ? 1 : 0) +
                         " exec_ms=" + String(exec_duration_ms) +
                         " queue_age_ms=" + String(queue_age_ms) +
                         " mqtt_connected=" + String(mqttClient.isConnected() ? 1 : 0));
        // #endregion
        publishIntentOutcome("command",
                             cmd.metadata,
                             ok ? "applied" : "failed",
                             ok ? "NONE" : "EXECUTE_FAIL",
                             ok ? "Actuator command applied" : "Actuator command execution failed",
                             !ok);
        processed++;
    }
}
