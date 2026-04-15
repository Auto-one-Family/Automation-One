#include "publish_queue.h"
#include "../utils/logger.h"
#include "../error_handling/error_tracker.h"
#include "../models/error_codes.h"
#include <cstring>

static const char* PQ_TAG = "SYNC";

QueueHandle_t g_publish_queue = NULL;

// ============================================
// initPublishQueue
// ============================================
void initPublishQueue() {
    g_publish_queue = xQueueCreate(PUBLISH_QUEUE_SIZE, sizeof(PublishRequest));
    if (g_publish_queue == NULL) {
        // Heap too small — system unstable, but we log and continue
        LOG_E(PQ_TAG, "[SYNC] Failed to create publish queue — system unstable!");
    } else {
        LOG_I(PQ_TAG, "[SYNC] Publish queue created (" + String(PUBLISH_QUEUE_SIZE) + " slots)");
    }
}

// ============================================
// queuePublish
// ============================================
bool queuePublish(const char* topic,
                  const char* payload,
                  uint8_t qos,
                  bool retain,
                  bool critical,
                  const IntentMetadata* metadata) {
    if (g_publish_queue == NULL) {
        LOG_W(PQ_TAG, "Publish queue not initialised, dropping: " + String(topic));
        return false;
    }

    size_t topic_len = strlen(topic);
    size_t payload_len = strlen(payload);
    if (topic_len >= PUBLISH_TOPIC_MAX_LEN || payload_len >= PUBLISH_PAYLOAD_MAX_LEN) {
        LOG_E(PQ_TAG, "[SYNC] Publish rejected (oversize) topic_len=" + String((uint32_t)topic_len) +
              " payload_len=" + String((uint32_t)payload_len));
        IntentMetadata oversize_meta = extractIntentMetadataFromPayload(payload, "pub");
        if (metadata != nullptr) {
            oversize_meta = *metadata;
        }
        if (critical) {
            publishIntentOutcome("publish",
                                 oversize_meta,
                                 "failed",
                                 "PAYLOAD_TOO_LARGE",
                                 "Critical publish payload exceeds queue envelope",
                                 true);
        }
        return false;
    }

    PublishRequest req;
    strncpy(req.topic, topic, sizeof(req.topic) - 1);
    req.topic[sizeof(req.topic) - 1] = '\0';
    strncpy(req.payload, payload, sizeof(req.payload) - 1);
    req.payload[sizeof(req.payload) - 1] = '\0';
    req.qos    = qos;
    req.retain = retain;
    req.critical = critical;
    req.attempt = 0;
    req.next_retry_ms = 0;  // AUT-6: No backoff delay on initial enqueue
    IntentMetadata fallback_meta = extractIntentMetadataFromPayload(payload, "pub");
    req.metadata = fallback_meta;
    if (metadata != nullptr) {
        req.metadata = *metadata;
    }

    TickType_t wait_ticks = critical ? pdMS_TO_TICKS(20) : 0;
    if (xQueueSend(g_publish_queue, &req, wait_ticks) != pdTRUE) {
        LOG_W(PQ_TAG, "[SYNC] Publish queue full — dropping: " + String(topic));
        errorTracker.logApplicationError(ERROR_TASK_QUEUE_FULL, "Publish queue full");
        if (critical) {
            publishIntentOutcome("publish",
                                 req.metadata,
                                 "failed",
                                 "QUEUE_FULL",
                                 "Critical publish queue full",
                                 true);
        }
        return false;
    }
    return true;
}
