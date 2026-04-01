#pragma once
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>

static const uint8_t ACTUATOR_CMD_QUEUE_SIZE = 10;

/** Raw MQTT topic+payload for Core 0 → Safety-Task queue (distinct from models::ActuatorCommand). */
struct ActuatorMqttQueueItem {
    char topic[128];
    char payload[512];
};

extern QueueHandle_t g_actuator_cmd_queue;

void initActuatorCommandQueue();
void queueActuatorCommand(const char* topic, const char* payload);
void processActuatorCommandQueue();
