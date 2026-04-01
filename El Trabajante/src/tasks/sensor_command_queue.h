#pragma once
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>

static const uint8_t SENSOR_CMD_QUEUE_SIZE = 10;

struct SensorCommand {
    char topic[128];
    char payload[512];
};

extern QueueHandle_t g_sensor_cmd_queue;

void initSensorCommandQueue();
void queueSensorCommand(const char* topic, const char* payload);
void processSensorCommandQueue();
