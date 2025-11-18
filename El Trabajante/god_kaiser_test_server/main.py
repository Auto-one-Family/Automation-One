import logging
import os
import time
from typing import Any, Dict, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from mqtt_client import MQTTTestClient


class SensorProcessRequest(BaseModel):
    esp_id: str
    gpio: int
    sensor_type: str
    raw_value: float
    timestamp: int
    metadata: Optional[Dict[str, Any]] = None


log_level = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(level=log_level)
logger = logging.getLogger("god-kaiser-mock")

mqtt_host = os.getenv("MQTT_BROKER", "localhost")
mqtt_port = int(os.getenv("MQTT_PORT", "1883"))
mqtt_client = MQTTTestClient(broker=mqtt_host, port=mqtt_port)

app = FastAPI(title="God-Kaiser Mock Server", version="1.0.0")


def register_subscriptions() -> None:
    @mqtt_client.subscribe("kaiser/god/esp/+/sensor/+/data")
    def handle_sensor_data(topic: str, payload: Dict[str, Any]) -> None:
        sensor_type = payload.get("sensor_type", "")
        raw_value = float(payload.get("raw_value", 0))

        if sensor_type == "ph_sensor":
            ph = (raw_value / 4095.0) * 14.0
            logger.info("Sensor event ph=%.2f topic=%s", ph, topic)
            if ph < 6.0:
                topic_parts = topic.split("/")
                source_esp = topic_parts[3] if len(topic_parts) > 3 else "ESP_UNKNOWN"
                target_esp = os.getenv("GK_TARGET_ACTUATOR_ESP", "ESP_BBB")
                command_topic = f"kaiser/god/esp/{target_esp}/actuator/12/command"
                command_payload = {
                    "command": "ON",
                    "reason": "Automation Rule: pH too low",
                    "rule_id": "rule_ph_low",
                    "source_esp": source_esp,
                    "timestamp": int(time.time())
                }
                mqtt_client.publish(command_topic, command_payload, qos=1)

    @mqtt_client.subscribe("kaiser/god/esp/+/actuator/+/alert")
    def handle_actuator_alert(topic: str, payload: Dict[str, Any]) -> None:
        alert_type = payload.get("alert_type")
        if alert_type == "emergency_stop":
            source_esp = payload.get("esp_id", "ESP_UNKNOWN")
            broadcast_topic = "kaiser/broadcast/emergency"
            broadcast_payload = {
                "action": "stop_all",
                "reason": payload.get("reason", "Emergency triggered"),
                "source_esp": source_esp,
                "timestamp": int(time.time())
            }
            mqtt_client.publish(broadcast_topic, broadcast_payload, qos=1)


@app.on_event("startup")
async def startup_event() -> None:
    mqtt_client.connect()
    register_subscriptions()
    logger.info("God-Kaiser mock server started")


@app.on_event("shutdown")
async def shutdown_event() -> None:
    mqtt_client.disconnect()
    logger.info("God-Kaiser mock server stopped")


@app.post("/api/v1/sensors/process")
async def process_sensor(request: SensorProcessRequest):
    if request.sensor_type != "ph_sensor":
        raise HTTPException(status_code=400, detail="Unknown sensor type")

    processed_value = (request.raw_value / 4095.0) * 14.0
    quality = "good" if 5.0 < processed_value < 9.0 else "warning"

    return {
        "processed_value": round(processed_value, 2),
        "unit": "pH",
        "quality": quality,
        "timestamp": request.timestamp,
        "esp_id": request.esp_id,
        "gpio": request.gpio
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000)

