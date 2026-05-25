#pragma once

#include <stdint.h>

// AUT-481 P3 queue sizing — shared by publish_queue.h and native policy tests.
static const uint8_t PUBLISH_QUEUE_SIZE = 10;
static const uint8_t PUBLISH_QUEUE_SHED_WATERMARK = 5;
