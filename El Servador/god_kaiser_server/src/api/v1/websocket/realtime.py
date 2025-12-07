"""
WebSocket API: Real-time Data Streaming

Provides WebSocket endpoint for real-time updates from the server.
"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ....core.logging_config import get_logger
from ....websocket.manager import WebSocketManager

logger = get_logger(__name__)

router = APIRouter()


@router.websocket("/ws/realtime/{client_id}")
async def websocket_realtime(websocket: WebSocket, client_id: str):
    """
    WebSocket endpoint for real-time updates.
    
    Clients can subscribe to specific message types and filters:
    - sensor_data: Sensor readings
    - actuator_status: Actuator state updates
    - logic_execution: Logic rule executions
    - esp_health: ESP device health updates
    - system_event: System events
    
    Example subscribe message:
    {
        "action": "subscribe",
        "filters": {
            "types": ["sensor_data", "actuator_status"],
            "esp_ids": ["ESP_12AB34CD"],
            "sensor_types": ["temperature", "humidity"]
        }
    }
    
    Args:
        websocket: WebSocket connection
        client_id: Unique client identifier
    """
    manager = await WebSocketManager.get_instance()
    await manager.connect(websocket, client_id)
    
    try:
        while True:
            # Receive client messages (subscribe/unsubscribe)
            data = await websocket.receive_json()
            action = data.get("action")
            
            if action == "subscribe":
                filters = data.get("filters", {})
                await manager.subscribe(client_id, filters)
                logger.debug(f"Client {client_id} subscribed with filters: {filters}")
            
            elif action == "unsubscribe":
                filters = data.get("filters", None)
                await manager.unsubscribe(client_id, filters)
                logger.debug(f"Client {client_id} unsubscribed")
            
            else:
                logger.warning(f"Unknown action from client {client_id}: {action}")
    
    except WebSocketDisconnect:
        logger.info(f"WebSocket client {client_id} disconnected")
    except Exception as e:
        logger.error(f"Error in WebSocket connection for {client_id}: {e}", exc_info=True)
    finally:
        await manager.disconnect(client_id)

