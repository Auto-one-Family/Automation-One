#pragma once
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>

#include "intent_contract.h"

// ============================================
// SAFETY-RTOS M3: Core 1 → Core 0 Publish Queue
// ============================================
// Safety-Task (Core 1) enqueues publish requests via queuePublish().
// Communication-Task (Core 0) drains the queue via MQTTClient::processPublishQueue().
// esp_mqtt_client_publish() is thread-safe, but routing all network I/O through
// Core 0 keeps Core 1 unblocked and makes debugging deterministic.
// ============================================

// Memory guard (ESP32 without PSRAM):
// 15 slots consumed ~33 KB heap and repeatedly prevented CommTask creation on real devices.
// 8 slots still absorb short bursts while preserving headroom for Core-0 network task startup.
static const uint8_t  PUBLISH_QUEUE_SIZE      = 8;      // 8 * ~2180 B = ~18 KB heap
static const uint16_t PUBLISH_TOPIC_MAX_LEN   = 128;
static const uint16_t PUBLISH_PAYLOAD_MAX_LEN = 1024;   // PKG-17: Heartbeat without gpio_status fits in 1024 B

// AUT-55: When queue fill >= watermark, non-critical messages are proactively shed
// to preserve slots for critical publishes (alerts, responses, intent_outcome).
static const uint8_t  PUBLISH_QUEUE_SHED_WATERMARK = 6;  // 75% of 8 slots

struct PublishRequest {
    char    topic[PUBLISH_TOPIC_MAX_LEN];
    char    payload[PUBLISH_PAYLOAD_MAX_LEN];
    uint8_t qos;
    bool    retain;
    bool    critical;
    uint8_t attempt;
    unsigned long next_retry_ms;  // For AUT-6: Backoff-aware retry scheduling
    IntentMetadata metadata;
};

// AUT-55: Telemetry snapshot for queue pressure reporting in heartbeat.
struct PublishQueuePressureStats {
    uint8_t  fill_level;     // Current queue occupancy (0..PUBLISH_QUEUE_SIZE)
    uint8_t  high_watermark; // Peak fill level observed since boot
    uint32_t shed_count;     // Non-critical messages proactively shed (backpressure)
    uint32_t drop_count;     // Messages dropped because queue was completely full
};

extern QueueHandle_t g_publish_queue;

// Create the publish queue — call in setup() BEFORE createSafetyTask().
void initPublishQueue();

// Enqueue a publish request from any task. Non-blocking: returns false if queue is full.
// AUT-55: When queue fill >= PUBLISH_QUEUE_SHED_WATERMARK and !critical, the message
// is proactively shed (returns false) to protect critical publish headroom.
bool queuePublish(const char* topic,
                  const char* payload,
                  uint8_t qos,
                  bool retain = false,
                  bool critical = false,
                  const IntentMetadata* metadata = nullptr);

// AUT-55: Query current queue pressure stats for heartbeat telemetry.
PublishQueuePressureStats getPublishQueuePressureStats();

// AUT-69: pause queue draining until session/announce PUBACK or guard timeout.
void pauseForAnnounceAck(uint32_t guard_timeout_ms = 300);
void resumeAfterAnnounceAck(const char* reason);
bool isPublishQueuePaused();
