#include "publish_queue.h"
#include "../utils/logger.h"
#include "../error_handling/error_tracker.h"
#include "../models/error_codes.h"
#include <cstring>
#include <atomic>

static const char* PQ_TAG = "SYNC";

QueueHandle_t g_publish_queue = NULL;

// AUT-55: Backpressure telemetry counters (atomic — written from Core 1, read from Core 0)
static std::atomic<uint32_t> g_pq_shed_count{0};   // Non-critical proactively shed
static std::atomic<uint32_t> g_pq_drop_count{0};   // Dropped because queue completely full
static std::atomic<uint8_t>  g_pq_high_watermark{0};
static std::atomic<bool>     g_pq_paused_for_announce_ack{false};
static std::atomic<uint32_t> g_pq_resume_guard_deadline_ms{0};

// ============================================
// initPublishQueue
// ============================================
void initPublishQueue() {
    g_publish_queue = xQueueCreate(PUBLISH_QUEUE_SIZE, sizeof(PublishRequest));
    if (g_publish_queue == NULL) {
        LOG_E(PQ_TAG, "[SYNC] Failed to create publish queue — system unstable!");
    } else {
        LOG_I(PQ_TAG, "[SYNC] Publish queue created (" + String(PUBLISH_QUEUE_SIZE) + " slots)");
    }
}

// ============================================
// AUT-55: getPublishQueuePressureStats
// ============================================
PublishQueuePressureStats getPublishQueuePressureStats() {
    PublishQueuePressureStats stats = {};
    if (g_publish_queue != NULL) {
        stats.fill_level = static_cast<uint8_t>(uxQueueMessagesWaiting(g_publish_queue));
    }
    stats.high_watermark = g_pq_high_watermark.load();
    stats.shed_count     = g_pq_shed_count.load();
    stats.drop_count     = g_pq_drop_count.load();
    return stats;
}

void pauseForAnnounceAck(uint32_t guard_timeout_ms) {
    const uint32_t now_ms = millis();
    g_pq_resume_guard_deadline_ms.store(now_ms + guard_timeout_ms);
    g_pq_paused_for_announce_ack.store(true);
}

void resumeAfterAnnounceAck(const char* reason) {
    const bool was_paused = g_pq_paused_for_announce_ack.exchange(false);
    g_pq_resume_guard_deadline_ms.store(0);
    if (was_paused) {
        LOG_I(PQ_TAG, String("[INC-EA5484] queue resumed (reason=") +
              String(reason != nullptr ? reason : "unknown") + ")");
    }
}

bool isPublishQueuePaused() {
    if (!g_pq_paused_for_announce_ack.load()) {
        return false;
    }

    const uint32_t deadline_ms = g_pq_resume_guard_deadline_ms.load();
    const uint32_t now_ms = millis();
    if (deadline_ms != 0 && static_cast<int32_t>(now_ms - deadline_ms) >= 0) {
        resumeAfterAnnounceAck("guard_timeout");
        return false;
    }

    return true;
}

// Helper: update high-watermark atomically (lock-free CAS loop)
static void updateHighWatermark(uint8_t current_fill) {
    uint8_t prev = g_pq_high_watermark.load();
    while (current_fill > prev) {
        if (g_pq_high_watermark.compare_exchange_weak(prev, current_fill)) break;
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
        LOG_W(PQ_TAG, "Publish queue not initialised, dropping: " + String(topic != nullptr ? topic : "<null-topic>"));
        return false;
    }

    // PKG-16 (INC-2026-04-11-ea5484): Null-safety defensive. Under OOM the
    // Arduino String backing an upstream c_str() can collapse to nullptr,
    // and strlen(NULL) is a LoadProhibited crash. Drop explicitly and count
    // into the application error path instead of trusting the caller.
    if (topic == nullptr || payload == nullptr) {
        g_pq_drop_count.fetch_add(1);
        LOG_W(PQ_TAG, "[SYNC] Publish rejected (null topic/payload) — likely upstream OOM");
        errorTracker.logApplicationError(ERROR_TASK_QUEUE_FULL, "Publish null topic/payload (OOM)");
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

    // AUT-55: Check queue fill level for backpressure shedding
    uint8_t fill = static_cast<uint8_t>(uxQueueMessagesWaiting(g_publish_queue));
    updateHighWatermark(fill);

    if (!critical && fill >= PUBLISH_QUEUE_SHED_WATERMARK) {
        g_pq_shed_count.fetch_add(1);
        LOG_D(PQ_TAG, "[SYNC] Backpressure shed (fill=" + String(fill) +
              "/" + String(PUBLISH_QUEUE_SIZE) + "): " + String(topic));
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
    req.next_retry_ms = 0;
    IntentMetadata fallback_meta = extractIntentMetadataFromPayload(payload, "pub");
    req.metadata = fallback_meta;
    if (metadata != nullptr) {
        req.metadata = *metadata;
    }

    TickType_t wait_ticks = critical ? pdMS_TO_TICKS(20) : 0;
    if (xQueueSend(g_publish_queue, &req, wait_ticks) != pdTRUE) {
        g_pq_drop_count.fetch_add(1);
        LOG_W(PQ_TAG, "[SYNC] Publish queue full — dropping: " + String(topic));
        errorTracker.logApplicationError(ERROR_TASK_QUEUE_FULL, "Publish queue full");
        if (critical) {
            bool is_intent_outcome_topic = strstr(req.topic, "/system/intent_outcome") != nullptr;
            if (!is_intent_outcome_topic) {
                publishIntentOutcome("publish",
                                     req.metadata,
                                     "failed",
                                     "QUEUE_FULL",
                                     "Critical publish queue full",
                                     true);
            } else {
                LOG_W(PQ_TAG,
                      "[SYNC] intent_outcome queue-full drop — skipping recursive failure outcome");
            }
        }
        return false;
    }

    // Update HWM after successful enqueue (fill is now +1)
    updateHighWatermark(fill + 1);
    return true;
}
