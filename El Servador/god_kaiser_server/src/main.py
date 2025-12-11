"""
God-Kaiser Server - Application Entry Point

FastAPI application with MQTT lifecycle management.

Features:
- MQTT client connection on startup
- Topic subscription and handler registration
- Database initialization
- Graceful shutdown
- Complete REST API with JWT authentication

Phase: 5 (Week 9-10) - API Layer
Status: IMPLEMENTED
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api import sensor_processing
from .api.v1 import api_v1_router
from .api.v1.websocket import realtime as websocket_realtime
from .core.config import get_settings
from .core.logging_config import get_logger
from .db.repositories import ActuatorRepository, ESPRepository, LogicRepository
from .db.session import dispose_engine, get_engine, get_session, init_db
from .mqtt.client import MQTTClient
from .mqtt.handlers import (
    actuator_handler,
    actuator_response_handler,
    actuator_alert_handler,
    config_handler,
    discovery_handler,
    heartbeat_handler,
    sensor_handler,
)
from .mqtt.publisher import Publisher
from .mqtt.subscriber import Subscriber
from .services.actuator_service import ActuatorService
from .services.logic.actions import (
    ActuatorActionExecutor,
    DelayActionExecutor,
    NotificationActionExecutor,
)
from .services.logic.conditions import (
    CompoundConditionEvaluator,
    SensorConditionEvaluator,
    TimeConditionEvaluator,
)
from .services.logic_engine import LogicEngine
from .services.logic_scheduler import LogicScheduler
from .services.safety_service import SafetyService
from .websocket.manager import WebSocketManager

logger = get_logger(__name__)
settings = get_settings()

# Global instances (for cleanup)
_subscriber_instance: Subscriber = None
_logic_engine: LogicEngine = None
_logic_scheduler: LogicScheduler = None
_websocket_manager: WebSocketManager = None


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
        # Step 0: Security Validation
        logger.info("Validating security configuration...")
        
        # Check JWT secret key
        if settings.security.jwt_secret_key == "change-this-secret-key-in-production":
            if settings.environment == "production":
                logger.critical(
                    "SECURITY CRITICAL: Using default JWT secret key in production! "
                    "This is a severe security risk. Set JWT_SECRET_KEY environment variable."
                )
                raise SystemExit(
                    "Cannot start server: Default JWT secret key detected in production. "
                    "Set JWT_SECRET_KEY environment variable to a secure random value."
                )
            else:
                logger.warning(
                    "SECURITY: Using default JWT secret key (OK for development only). "
                    "Change JWT_SECRET_KEY in production!"
                )
        
        # Check MQTT TLS if auth is enabled
        # Note: We can't check if auth is enabled yet (DB not initialized), but we can warn
        if not settings.mqtt.use_tls:
            logger.warning(
                "MQTT TLS is disabled. MQTT authentication credentials will be sent in plain text. "
                "Enable MQTT_USE_TLS for secure credential distribution."
            )
        
        logger.info("Security validation complete")
        
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

            # Get KAISER_ID from config (default: "god")
            kaiser_id = settings.hierarchy.kaiser_id
            logger.info(f"Using KAISER_ID: {kaiser_id}")

            # Register handlers for each topic pattern (dynamic kaiser_id)
            _subscriber_instance.register_handler(
                f"kaiser/{kaiser_id}/esp/+/sensor/+/data",
                sensor_handler.handle_sensor_data
            )
            _subscriber_instance.register_handler(
                f"kaiser/{kaiser_id}/esp/+/actuator/+/status",
                actuator_handler.handle_actuator_status
            )
            # Phase 8: Actuator Response Handler (command confirmations)
            _subscriber_instance.register_handler(
                f"kaiser/{kaiser_id}/esp/+/actuator/+/response",
                actuator_response_handler.handle_actuator_response
            )
            # Phase 8: Actuator Alert Handler (emergency/timeout alerts)
            _subscriber_instance.register_handler(
                f"kaiser/{kaiser_id}/esp/+/actuator/+/alert",
                actuator_alert_handler.handle_actuator_alert
            )
            _subscriber_instance.register_handler(
                f"kaiser/{kaiser_id}/esp/+/system/heartbeat",
                heartbeat_handler.handle_heartbeat
            )
            _subscriber_instance.register_handler(
                f"kaiser/{kaiser_id}/discovery/esp32_nodes",
                discovery_handler.handle_discovery
            )
            _subscriber_instance.register_handler(
                f"kaiser/{kaiser_id}/esp/+/config_response",
                config_handler.handle_config_ack
            )

            logger.info(f"Registered {len(_subscriber_instance.handlers)} MQTT handlers")

            # Step 4: Subscribe to all topics
            logger.info("Subscribing to MQTT topics...")
            _subscriber_instance.subscribe_all()
            logger.info("MQTT subscriptions complete")

        # Step 5: Initialize WebSocket Manager
        logger.info("Initializing WebSocket Manager...")
        global _websocket_manager
        _websocket_manager = await WebSocketManager.get_instance()
        await _websocket_manager.initialize()
        logger.info("WebSocket Manager initialized")

        # Step 6: Initialize Safety Service, Actuator Service, and Logic Engine
        logger.info("Initializing services...")
        async for session in get_session():
            # Initialize repositories
            actuator_repo = ActuatorRepository(session)
            esp_repo = ESPRepository(session)
            logic_repo = LogicRepository(session)
            
            # Initialize Safety Service
            safety_service = SafetyService(actuator_repo, esp_repo)
            
            # Initialize Publisher
            publisher = Publisher()
            
            # Initialize Actuator Service
            actuator_service = ActuatorService(actuator_repo, safety_service, publisher)
            
            # Initialize Logic Engine with modular evaluators and executors
            global _logic_engine, _logic_scheduler
            
            # Setup condition evaluators
            sensor_evaluator = SensorConditionEvaluator()
            time_evaluator = TimeConditionEvaluator()
            compound_evaluator = CompoundConditionEvaluator([sensor_evaluator, time_evaluator])
            condition_evaluators = [sensor_evaluator, time_evaluator, compound_evaluator]
            
            # Setup action executors
            actuator_executor = ActuatorActionExecutor(actuator_service)
            delay_executor = DelayActionExecutor()
            notification_executor = NotificationActionExecutor(_websocket_manager)
            action_executors = [actuator_executor, delay_executor, notification_executor]
            
            # Initialize Logic Engine
            _logic_engine = LogicEngine(
                logic_repo=logic_repo,
                actuator_service=actuator_service,
                websocket_manager=_websocket_manager,
                condition_evaluators=condition_evaluators,
                action_executors=action_executors,
            )
            await _logic_engine.start()
            
            # Initialize Logic Scheduler
            _logic_scheduler = LogicScheduler(_logic_engine, interval_seconds=60)
            await _logic_scheduler.start()
            
            # Set global instance for handlers
            from .services.logic_engine import set_logic_engine
            set_logic_engine(_logic_engine)
            
            logger.info("Services initialized successfully")
            break  # Exit after first session

        logger.info("=" * 60)
        logger.info("God-Kaiser Server Started Successfully")
        logger.info(f"Environment: {settings.environment}")
        logger.info(f"Log Level: {settings.log_level}")
        logger.info(f"MQTT Broker: {settings.mqtt.broker_host}:{settings.mqtt.broker_port}")
        logger.info("API Endpoints: /api/v1/auth, /api/v1/esp, /api/v1/sensors, /api/v1/actuators, /api/v1/logic, /api/v1/health")
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
        # Step 1: Stop Logic Scheduler
        if _logic_scheduler:
            logger.info("Stopping Logic Scheduler...")
            await _logic_scheduler.stop()
            logger.info("Logic Scheduler stopped")
        
        # Step 2: Stop Logic Engine
        if _logic_engine:
            logger.info("Stopping Logic Engine...")
            await _logic_engine.stop()
            logger.info("Logic Engine stopped")
        
        # Step 3: Shutdown WebSocket Manager
        if _websocket_manager:
            logger.info("Shutting down WebSocket Manager...")
            await _websocket_manager.shutdown()
            logger.info("WebSocket Manager shutdown complete")
        
        # Step 4: Shutdown MQTT subscriber (thread pool)
        if _subscriber_instance:
            logger.info("Shutting down MQTT subscriber thread pool...")
            _subscriber_instance.shutdown(wait=True, timeout=30.0)
            logger.info("MQTT subscriber shutdown complete")
        
        # Step 5: Disconnect MQTT client
        logger.info("Disconnecting MQTT client...")
        mqtt_client = MQTTClient.get_instance()
        if mqtt_client.is_connected():
            mqtt_client.disconnect()
            logger.info("MQTT client disconnected")

        # Step 6: Dispose database engine
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
    description="""
    Central control hub for ESP32 automation nodes with Pi-Enhanced sensor processing.
    
    ## Features
    - **ESP32 Device Management**: Register, configure, and monitor ESP32 nodes
    - **Sensor Processing**: Server-side Pi-Enhanced sensor data processing
    - **Actuator Control**: Safe command execution with safety validation
    - **Logic Automation**: Cross-ESP automation rules
    - **Real-time Updates**: WebSocket support for live data
    
    ## Authentication
    - JWT tokens for user authentication
    - API keys for ESP32 devices
    
    ## API Versions
    - v1: Current stable API
    """,
    version="2.0.0",
    lifespan=lifespan,
    openapi_tags=[
        {"name": "auth", "description": "Authentication & Authorization"},
        {"name": "esp", "description": "ESP32 Device Management"},
        {"name": "sensors", "description": "Sensor Configuration & Data"},
        {"name": "actuators", "description": "Actuator Control & Commands"},
        {"name": "logic", "description": "Logic Rules & Automation"},
        {"name": "health", "description": "Health Checks & Metrics"},
        {"name": "websocket", "description": "WebSocket Real-time Updates"},
    ],
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
@app.get("/", tags=["root"])
async def root():
    """Health check endpoint."""
    mqtt_client = MQTTClient.get_instance()
    return {
        "service": "God-Kaiser Server",
        "version": "2.0.0",
        "status": "online",
        "mqtt_connected": mqtt_client.is_connected(),
        "environment": settings.environment,
        "docs": "/docs",
        "api_prefix": "/api/v1",
    }


# ===== API v1 ROUTERS =====

# Include all v1 API endpoints
app.include_router(
    api_v1_router,
    prefix="/api",
)

# Sensor Processing API (Real-Time HTTP) - keep at root for backward compatibility
app.include_router(
    sensor_processing.router,
    tags=["sensors", "processing"],
)

# WebSocket API
app.include_router(
    websocket_realtime.router,
    prefix="/api/v1",
    tags=["websocket"],
)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "god_kaiser_server.src.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.environment == "development",
        log_level=settings.log_level.lower(),
    )
