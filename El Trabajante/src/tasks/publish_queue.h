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

static const uint8_t  PUBLISH_QUEUE_SIZE      = 15;     // 15 * ~1156 B = ~17 KB heap
static const uint16_t PUBLISH_TOPIC_MAX_LEN   = 128;
static const uint16_t PUBLISH_PAYLOAD_MAX_LEN = 1024;   // Heartbeat payloads can exceed 512 B

struct PublishRequest {
    char    topic[PUBLISH_TOPIC_MAX_LEN];
    char    payload[PUBLISH_PAYLOAD_MAX_LEN];
    uint8_t qos;
    bool    retain;
    bool    critical;
    uint8_t attempt;
    IntentMetadata metadata;
};

extern QueueHandle_t g_publish_queue;

// Create the publish queue — call in setup() BEFORE createSafetyTask().
void initPublishQueue();

// Enqueue a publish request from any task. Non-blocking: returns false if queue is full.
// Returns true if enqueued, false if dropped.
bool queuePublish(const char* topic,
                  const char* payload,
                  uint8_t qos,
                  bool retain = false,
                  bool critical = false,
                  const IntentMetadata* metadata = nullptr);
