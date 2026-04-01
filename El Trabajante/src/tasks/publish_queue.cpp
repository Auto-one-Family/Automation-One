#include "publish_queue.h"
#include "../utils/logger.h"
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
bool queuePublish(const char* topic, const char* payload, uint8_t qos, bool retain) {
    if (g_publish_queue == NULL) {
        LOG_W(PQ_TAG, "Publish queue not initialised, dropping: " + String(topic));
        return false;
    }

    PublishRequest req;
    strncpy(req.topic, topic, sizeof(req.topic) - 1);
    req.topic[sizeof(req.topic) - 1] = '\0';
    strncpy(req.payload, payload, sizeof(req.payload) - 1);
    req.payload[sizeof(req.payload) - 1] = '\0';
    req.qos    = qos;
    req.retain = retain;

    if (xQueueSend(g_publish_queue, &req, 0) != pdTRUE) {
        LOG_W(PQ_TAG, "[SYNC] Publish queue full — dropping: " + String(topic));
        return false;
    }
    return true;
}
