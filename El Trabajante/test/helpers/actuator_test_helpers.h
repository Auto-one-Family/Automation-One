#pragma once

#include <Arduino.h>

#include <utility>
#include <vector>

class MockMQTTBroker;

std::vector<uint8_t> getAvailableActuatorGPIOs();
uint8_t findFreeTestGPIO(const char* type);
std::pair<uint8_t, uint8_t> getAvailableValveGPIOPair();
uint8_t findExistingActuator(const String& type);
void ensure_actuator_stack_initialized();
void actuator_test_teardown(MockMQTTBroker* broker = nullptr);

