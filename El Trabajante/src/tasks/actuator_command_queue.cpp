#include "actuator_command_queue.h"
#include <cstring>

#include "../services/actuator/actuator_manager.h"
#include "../utils/logger.h"

static const char* ACT_Q_TAG = "SYNC";

QueueHandle_t g_actuator_cmd_queue = NULL;

void initActuatorCommandQueue() {
    g_actuator_cmd_queue = xQueueCreate(ACTUATOR_CMD_QUEUE_SIZE, sizeof(ActuatorMqttQueueItem));
    if (g_actuator_cmd_queue == NULL) {
        LOG_E(ACT_Q_TAG, "[SYNC] Failed to create actuator command queue");
    }
}

void queueActuatorCommand(const char* topic, const char* payload) {
    if (g_actuator_cmd_queue == NULL) return;
    ActuatorMqttQueueItem cmd;
    strncpy(cmd.topic, topic, sizeof(cmd.topic) - 1);
    cmd.topic[sizeof(cmd.topic) - 1] = '\0';
    strncpy(cmd.payload, payload, sizeof(cmd.payload) - 1);
    cmd.payload[sizeof(cmd.payload) - 1] = '\0';
    xQueueSend(g_actuator_cmd_queue, &cmd, 0);
}

void processActuatorCommandQueue() {
    if (g_actuator_cmd_queue == NULL) return;
    ActuatorMqttQueueItem cmd;
    while (xQueueReceive(g_actuator_cmd_queue, &cmd, 0) == pdTRUE) {
        actuatorManager.handleActuatorCommand(String(cmd.topic), String(cmd.payload));
    }
}
