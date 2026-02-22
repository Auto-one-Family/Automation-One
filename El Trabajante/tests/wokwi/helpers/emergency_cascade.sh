#!/bin/bash
# ============================================
# Emergency Cascade Helper Script
# ============================================
# Activates multiple actuators then triggers a broadcast emergency stop.
# Used by the error-injection CI job for the emergency cascade scenario.
#
# Usage: ./emergency_cascade.sh [MQTT_HOST] [ESP_ID]
# Default: localhost ESP_00000001

MQTT_HOST="${1:-localhost}"
ESP_ID="${2:-ESP_00000001}"
KAISER_ID="god"

echo "=== Emergency Cascade Test ==="
echo "MQTT Host: $MQTT_HOST"
echo "ESP ID: $ESP_ID"

# Step 1: Activate actuator on GPIO 5 (binary ON)
echo "[1/4] Activating actuator GPIO 5 (ON)..."
mosquitto_pub -h "$MQTT_HOST" \
  -t "kaiser/$KAISER_ID/esp/$ESP_ID/actuator/5/command" \
  -m '{"command":"ON","value":1.0}'

sleep 1

# Step 2: Activate actuator on GPIO 13 (PWM 70%)
echo "[2/4] Activating actuator GPIO 13 (PWM 70%)..."
mosquitto_pub -h "$MQTT_HOST" \
  -t "kaiser/$KAISER_ID/esp/$ESP_ID/actuator/13/command" \
  -m '{"command":"PWM","value":0.7}'

sleep 3

# Step 3: Trigger broadcast emergency stop
echo "[3/4] Sending BROADCAST EMERGENCY STOP..."
mosquitto_pub -h "$MQTT_HOST" \
  -t "kaiser/broadcast/emergency" \
  -m '{"auth_token":"master_token"}'

sleep 5

# Step 4: Clear emergency
echo "[4/4] Clearing emergency state..."
mosquitto_pub -h "$MQTT_HOST" \
  -t "kaiser/$KAISER_ID/esp/$ESP_ID/actuator/emergency" \
  -m '{"command":"emergency_clear","auth_token":"'"$ESP_ID"'"}'

echo "=== Emergency Cascade Complete ==="
