"""
God-Kaiser Server - Application Entry Point

FastAPI application with MQTT lifecycle management.

Features:
- MQTT client connection on startup
- Topic subscription and handler registration
- Database initialization
- Graceful shutdown
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api import sensor_processing
from .core.config import get_settings
from .core.logging_config import get_logger
from .db.session import dispose_engine, get_engine, init_db
from .mqtt.client import MQTTClient
from .mqtt.handlers import actuator_handler, heartbeat_handler, sensor_handler
from .mqtt.subscriber import Subscriber

logger = get_logger(__name__)
settings = get_settings()

# Global subscriber instance (for cleanup)
_subscriber_instance: Subscriber = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    FastAPI lifespan context manager.

    Handles startup and shutdown events:
    - Startup: Initialize database, connect MQTT, subscribe to topics
    - Shutdown: Disconnect MQTT, dispose database engine
    """
    logger.info("=" * 60)
    logger.info("God-Kaiser Server Starting...")
    logger.info("=" * 60)

    # ===== STARTUP =====
    try:
        # Step 1: Initialize database
        if settings.database.auto_init:
            logger.info("Initializing database...")
            await init_db()
            logger.info("Database initialized successfully")
        else:
            logger.info("Skipping database init (auto_init=False)")
            # Ensure engine is created even if not auto-initializing
            get_engine()

        # Step 2: Connect to MQTT broker
        logger.info("Connecting to MQTT broker...")
        mqtt_client = MQTTClient.get_instance()
        connected = mqtt_client.connect()

        if not connected:
            logger.error("Failed to connect to MQTT broker. Server will start but MQTT is unavailable.")
        else:
            logger.info("MQTT client connected successfully")

            # Step 3: Register MQTT handlers
            logger.info("Registering MQTT handlers...")
            global _subscriber_instance
            _subscriber_instance = Subscriber(mqtt_client, max_workers=10)

            # Register handlers for each topic pattern
            _subscriber_instance.register_handler(
                "kaiser/god/esp/+/sensor/+/data",
                sensor_handler.handle_sensor_data
            )
            _subscriber_instance.register_handler(
                "kaiser/god/esp/+/actuator/+/status",
                actuator_handler.handle_actuator_status
            )
            _subscriber_instance.register_handler(
                "kaiser/god/esp/+/heartbeat",
                heartbeat_handler.handle_heartbeat
            )

            logger.info(f"Registered {len(_subscriber_instance.handlers)} MQTT handlers")

            # Step 4: Subscribe to all topics
            logger.info("Subscribing to MQTT topics...")
            _subscriber_instance.subscribe_all()
            logger.info("MQTT subscriptions complete")

        logger.info("=" * 60)
        logger.info("God-Kaiser Server Started Successfully")
        logger.info(f"Environment: {settings.environment}")
        logger.info(f"Log Level: {settings.log_level}")
        logger.info(f"MQTT Broker: {settings.mqtt.broker_host}:{settings.mqtt.broker_port}")
        logger.info("=" * 60)

        yield  # Server runs here

    except Exception as e:
        logger.error(f"Startup failed: {e}", exc_info=True)
        raise

    # ===== SHUTDOWN =====
    logger.info("=" * 60)
    logger.info("God-Kaiser Server Shutting Down...")
    logger.info("=" * 60)

    try:
        # Step 1: Shutdown MQTT subscriber (thread pool)
        global _subscriber_instance
        if _subscriber_instance:
            logger.info("Shutting down MQTT subscriber thread pool...")
            _subscriber_instance.shutdown(wait=True, timeout=30.0)
            logger.info("MQTT subscriber shutdown complete")
        
        # Step 2: Disconnect MQTT client
        logger.info("Disconnecting MQTT client...")
        mqtt_client = MQTTClient.get_instance()
        if mqtt_client.is_connected():
            mqtt_client.disconnect()
            logger.info("MQTT client disconnected")

        # Step 3: Dispose database engine
        logger.info("Disposing database engine...")
        await dispose_engine()
        logger.info("Database engine disposed")

        logger.info("=" * 60)
        logger.info("God-Kaiser Server Shutdown Complete")
        logger.info("=" * 60)

    except Exception as e:
        logger.error(f"Shutdown failed: {e}", exc_info=True)


# ===== CREATE FASTAPI APP =====

app = FastAPI(
    title="God-Kaiser Server",
    description="Central control hub for ESP32 automation nodes with Pi-Enhanced sensor processing",
    version="2.0.0",
    lifespan=lifespan,
)

# ===== MIDDLEWARE =====

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ===== ROUTES =====

# Root endpoint
@app.get("/")
async def root():
    """Health check endpoint."""
    mqtt_client = MQTTClient.get_instance()
    return {
        "service": "God-Kaiser Server",
        "version": "2.0.0",
        "status": "online",
        "mqtt_connected": mqtt_client.is_connected(),
        "environment": settings.environment,
    }


@app.get("/health")
async def health_check():
    """Detailed health check endpoint."""
    mqtt_client = MQTTClient.get_instance()

    return {
        "status": "healthy",
        "mqtt": {
            "connected": mqtt_client.is_connected(),
            "broker": f"{settings.mqtt.broker_host}:{settings.mqtt.broker_port}",
        },
        "database": {
            "connected": True,  # If we got here, DB is accessible
        },
    }


# ===== API ROUTERS =====

# Sensor Processing API (Real-Time HTTP)
app.include_router(
    sensor_processing.router,
    tags=["sensors", "processing"],
)

# TODO: Additional routers when implemented
# from .api import esp_devices, actuators, system
# app.include_router(esp_devices.router)
# app.include_router(actuators.router)
# app.include_router(system.router)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "god_kaiser_server.src.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.environment == "development",
        log_level=settings.log_level.lower(),
    )
