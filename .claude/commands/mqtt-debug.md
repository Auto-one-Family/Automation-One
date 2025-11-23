---
description: MQTT Protocol Debugging Informationen
---

# MQTT Protocol Debugging

Zeige relevante MQTT-Informationen für Debugging.

## Aufgabe

1. **MQTT Protocol dokumentieren:**
   - Lese `El Trabajante/docs/Mqtt_Protocoll.md`
   - Zeige Topic-Schema-Übersicht
   - Zeige Beispiel-Payloads

2. **Topic-Übersicht:**

   **ESP → God-Kaiser:**
   ```
   kaiser/god/esp/{esp_id}/sensor/{gpio}/data
   kaiser/god/esp/{esp_id}/actuator/{gpio}/status
   kaiser/god/esp/{esp_id}/health/status
   kaiser/god/esp/{esp_id}/system/status
   ```

   **God-Kaiser → ESP:**
   ```
   kaiser/god/esp/{esp_id}/actuator/{gpio}/command
   kaiser/god/esp/{esp_id}/config/sensor/{gpio}
   kaiser/god/esp/{esp_id}/config/actuator/{gpio}
   kaiser/god/esp/{esp_id}/system/command
   ```

3. **Aktuelle Konfiguration:**
   - ESP32 MQTT Config: `El Trabajante/src/services/communication/mqtt_client.h`
   - Server MQTT Config: `El Servador/god_kaiser_server/src/mqtt/`
   - Zeige QoS-Levels, Timeouts, Keepalive

4. **Debugging-Kommandos:**

   **Subscribe zu allen Topics:**
   ```bash
   mosquitto_sub -h <broker-ip> -p 8883 -t "kaiser/god/#" -v --cafile ca.crt
   ```

   **Publish Test-Message:**
   ```bash
   mosquitto_pub -h <broker-ip> -p 8883 -t "kaiser/god/esp/test/sensor/4/data" -m '{"value":25.5}' --cafile ca.crt
   ```

   **Monitor ESP-spezifisch:**
   ```bash
   mosquitto_sub -h <broker-ip> -p 8883 -t "kaiser/god/esp/{esp_id}/#" -v
   ```

5. **Payload-Beispiele:**
   - Sensor Data
   - Actuator Command
   - Health Status
   - Config Message

## Common Issues

- **Connection Failed:** Prüfe Broker-IP, Port, TLS-Certs
- **Auth Failed:** Prüfe MQTT Username/Password
- **QoS Issues:** Prüfe QoS-Level (0/1/2)
- **Message Loss:** Prüfe MQTT Buffer-Größe
- **Timeout:** Prüfe Keepalive-Settings

## ESP32 MQTT Config Check

Zeige aktuelle MQTT-Konfiguration aus:
- `mqtt_client.h` - Client-Settings
- `mqtt_client.cpp` - Reconnect-Logic
- Feature Flag: `MQTT_MAX_PACKET_SIZE`

## Server MQTT Config Check

Zeige aktuelle Konfiguration aus:
- `mqtt/client.py` - Paho-MQTT Client
- `mqtt/handlers/` - Topic Handlers
- Broker: Mosquitto Config (Port 8883, TLS)
