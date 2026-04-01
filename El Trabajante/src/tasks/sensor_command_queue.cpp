#include "sensor_command_queue.h"
#include <cstring>

#include "../utils/logger.h"

static const char* SENS_Q_TAG = "SYNC";

// Forward declaration — defined in main.cpp
// Runs on Core 1 (Safety-Task context) after being queued from Core 0 (ESP-IDF MQTT task).
extern void handleSensorCommand(const String& topic, const String& payload);

QueueHandle_t g_sensor_cmd_queue = NULL;

void initSensorCommandQueue() {
    g_sensor_cmd_queue = xQueueCreate(SENSOR_CMD_QUEUE_SIZE, sizeof(SensorCommand));
    if (g_sensor_cmd_queue == NULL) {
        LOG_E(SENS_Q_TAG, "[SYNC] Failed to create sensor command queue");
    }
}

void queueSensorCommand(const char* topic, const char* payload) {
    if (g_sensor_cmd_queue == NULL) return;
    SensorCommand cmd;
    strncpy(cmd.topic, topic, sizeof(cmd.topic) - 1);
    cmd.topic[sizeof(cmd.topic) - 1] = '\0';
    strncpy(cmd.payload, payload, sizeof(cmd.payload) - 1);
    cmd.payload[sizeof(cmd.payload) - 1] = '\0';
    xQueueSend(g_sensor_cmd_queue, &cmd, 0);
}

// M2: Processes all queued sensor commands on Core 1 (Safety-Task).
// Called from safetyTaskFunction() — same task that owns sensorManager.
void processSensorCommandQueue() {
    if (g_sensor_cmd_queue == NULL) return;
    SensorCommand cmd;
    while (xQueueReceive(g_sensor_cmd_queue, &cmd, 0) == pdTRUE) {
        handleSensorCommand(String(cmd.topic), String(cmd.payload));
    }
}
