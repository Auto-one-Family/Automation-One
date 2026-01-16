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

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api import sensor_processing
from .api.v1 import api_v1_router
from .api.v1.websocket import realtime as websocket_realtime
from .core.config import get_settings
from .core.exception_handlers import (
    automation_one_exception_handler,
    general_exception_handler,
)
from .core.exceptions import GodKaiserException
from .core.logging_config import get_logger, setup_logging
from .core.resilience import ResilienceRegistry, get_health_status
from .db.repositories import ActuatorRepository, ESPRepository, LogicRepository
from .db.session import dispose_engine, get_engine, get_session, init_db, init_db_circuit_breaker
from .mqtt.client import MQTTClient
from .mqtt.handlers import (
    actuator_handler,
    actuator_response_handler,
    actuator_alert_handler,
    config_handler,
    discovery_handler,
    error_handler,
    heartbeat_handler,
    lwt_handler,
    sensor_handler,
    subzone_ack_handler,
    zone_ack_handler,
)
from .mqtt.publisher import Publisher
from .mqtt.subscriber import Subscriber
from .services.actuator_service import ActuatorService
from .services.logic.actions import (
    ActuatorActionExecutor,
    DelayActionExecutor,
    NotificationActionExecutor,
    SequenceActionExecutor,
)
from .services.logic.conditions import (
    CompoundConditionEvaluator,
    HysteresisConditionEvaluator,
    SensorConditionEvaluator,
    TimeConditionEvaluator,
)
from .services.logic_engine import LogicEngine
from .services.logic_scheduler import LogicScheduler
from .services.safety_service import SafetyService
from .websocket.manager import WebSocketManager

# Initialize logging BEFORE any logger usage
setup_logging()

logger = get_logger(__name__)
settings = get_settings()

# Global instances (for cleanup)
_subscriber_instance: Subscriber = None
_logic_engine: LogicEngine = None
_logic_scheduler: LogicScheduler = None
_websocket_manager: WebSocketManager = None
_sequence_executor: SequenceActionExecutor = None


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
        
        # Step 0.5: Initialize Resilience Patterns
        logger.info("Initializing resilience patterns...")
        
        # Initialize registry (singleton)
        resilience_registry = ResilienceRegistry.get_instance()
        
        # Database circuit breaker will be initialized in init_db_circuit_breaker()
        # MQTT circuit breaker is initialized in MQTTClient.__init__()
        
        # Initialize external API circuit breaker (optional)
        from .core.resilience import CircuitBreaker
        external_api_breaker = CircuitBreaker(
            name="external_api",
            failure_threshold=settings.resilience.circuit_breaker_api_failure_threshold,
            recovery_timeout=float(settings.resilience.circuit_breaker_api_recovery_timeout),
            half_open_timeout=float(settings.resilience.circuit_breaker_api_half_open_timeout),
        )
        resilience_registry.register_circuit_breaker("external_api", external_api_breaker)
        
        logger.info(
            f"[resilience] Resilience patterns initialized: "
            f"registry ready, external_api breaker registered"
        )
        
        # Step 1: Initialize database
        if settings.database.auto_init:
            logger.info("Initializing database...")
            await init_db()
            logger.info("Database initialized successfully")
        else:
            logger.info("Skipping database init (auto_init=False)")
            # Ensure engine is created even if not auto-initializing
            get_engine()
        
        # Initialize database circuit breaker after DB is ready
        init_db_circuit_breaker()
        logger.info("[resilience] Database circuit breaker initialized")

        # Step 2: Connect to MQTT broker
        logger.info("Connecting to MQTT broker...")
        mqtt_client = MQTTClient.get_instance()
        connected = mqtt_client.connect()

        if not connected:
            logger.warning(
                "Failed to connect to MQTT broker during startup. "
                "Server will start anyway - auto-reconnect will attempt to restore connection."
            )
        else:
            logger.info("MQTT client connected successfully")

        # Step 3: Register MQTT handlers (ALWAYS, even if not connected)
        # Handlers will be called when auto-reconnect succeeds
        logger.info("Registering MQTT handlers...")
        global _subscriber_instance
        _subscriber_instance = Subscriber(
            mqtt_client,
            max_workers=settings.mqtt.subscriber_max_workers,
        )

        # BUG O FIX (2026-01-05): Explicitly set main event loop for async handlers
        # This ensures SQLAlchemy AsyncEngine operations run in the correct event loop,
        # preventing "Queue bound to different event loop" errors in Python 3.12+.
        _subscriber_instance.set_main_loop(asyncio.get_running_loop())
        logger.info("Main event loop set for MQTT subscriber")

        # Register subscriber in MQTT client for auto re-subscription on reconnect
        mqtt_client.set_subscriber(_subscriber_instance)

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
        # Phase 7: Zone ACK Handler (zone assignment confirmations)
        _subscriber_instance.register_handler(
            f"kaiser/{kaiser_id}/esp/+/zone/ack",
            zone_ack_handler.handle_zone_ack
        )
        # Phase 9: Subzone ACK Handler (subzone assignment confirmations)
        _subscriber_instance.register_handler(
            f"kaiser/{kaiser_id}/esp/+/subzone/ack",
            subzone_ack_handler.handle_subzone_ack
        )
        # LWT Handler (Instant Offline Detection)
        # Topic: kaiser/{kaiser_id}/esp/+/system/will
        # ESP32 builds LWT topic from heartbeat: /system/heartbeat -> /system/will
        # QoS: 1 (broker publishes LWT with QoS from ESP32 config)
        # This provides INSTANT offline detection when ESP32 disconnects unexpectedly
        _subscriber_instance.register_handler(
            f"kaiser/{kaiser_id}/esp/+/system/will",
            lwt_handler.handle_lwt
        )
        logger.info(f"LWT handler registered: kaiser/{kaiser_id}/esp/+/system/will")
        # Error Event Handler (DS18B20/OneWire errors, GPIO conflicts, etc.)
        # Topic: kaiser/{kaiser_id}/esp/+/system/error
        # ESP32 publishes hardware/config errors to this topic for server processing
        _subscriber_instance.register_handler(
            f"kaiser/{kaiser_id}/esp/+/system/error",
            error_handler.handle_error_event
        )
        logger.info(f"Error handler registered: kaiser/{kaiser_id}/esp/+/system/error")

        logger.info(f"Registered {len(_subscriber_instance.handlers)} MQTT handlers")

        # Step 3.4: Initialize Central Scheduler
        logger.info("Initializing Central Scheduler...")
        from .core.scheduler import init_central_scheduler
        _central_scheduler = init_central_scheduler()
        logger.info("Central Scheduler started")

        # Step 3.4.1: Initialize SimulationScheduler
        logger.info("Initializing SimulationScheduler...")
        from .services.simulation import init_simulation_scheduler
        import json
        def mqtt_publish_for_simulation(topic: str, payload: dict, qos: int = 1):
            if mqtt_client and mqtt_client.is_connected():
                mqtt_client.publish(topic, json.dumps(payload), qos=qos)
        _simulation_scheduler = init_simulation_scheduler(mqtt_publish_for_simulation)
        logger.info("SimulationScheduler initialized")

        # Paket G: Register handler for Mock-ESP actuator commands
        # This allows Mock-ESPs to receive commands sent by the server
        async def mock_actuator_command_handler(topic: str, payload: dict) -> bool:
            """Route actuator commands to Mock-ESP handler if target is an active mock."""
            try:
                from .services.simulation import get_simulation_scheduler
                sim_scheduler = get_simulation_scheduler()
                # Convert payload back to JSON string for handler
                payload_str = json.dumps(payload)
                return await sim_scheduler.handle_mqtt_message(topic, payload_str)
            except RuntimeError:
                # SimulationScheduler not initialized
                return False
            except Exception as e:
                logger.debug(f"Mock actuator command handler error: {e}")
                return False

        _subscriber_instance.register_handler(
            f"kaiser/{kaiser_id}/esp/+/actuator/+/command",
            mock_actuator_command_handler
        )
        # Also handle emergency topics for mocks
        _subscriber_instance.register_handler(
            f"kaiser/{kaiser_id}/esp/+/actuator/emergency",
            mock_actuator_command_handler
        )
        _subscriber_instance.register_handler(
            "kaiser/broadcast/emergency",
            mock_actuator_command_handler
        )
        logger.info("Registered Mock-ESP actuator command handlers (Paket G)")

        # Step 3.4.2: Initialize MaintenanceService
        logger.info("Initializing MaintenanceService...")
        from .services.maintenance import init_maintenance_service
        _maintenance_service = init_maintenance_service(
            scheduler=_central_scheduler,
            session_factory=get_session,
            mqtt_client=mqtt_client,
            settings=settings
        )
        _maintenance_service.start()  # Registriert alle Jobs
        logger.info("MaintenanceService initialized and started")

        # Step 3.5: Recover running Mock-ESP simulations from database (Paket X)
        # After server restart, resume any simulations that were active before shutdown
        # Uses SimulationScheduler.recover_mocks() for DB-First architecture
        try:
            async for session in get_session():
                recovered_count = await _simulation_scheduler.recover_mocks(session)
                if recovered_count > 0:
                    logger.info(f"Mock-ESP recovery complete: {recovered_count} simulations restored")
                else:
                    logger.info("No active Mock-ESP simulations to recover")
                break  # Exit after first session
        except Exception as e:
            logger.warning(f"Mock-ESP recovery failed (non-critical): {e}")

        # Step 3.6: Sensor Type Auto-Registration (Phase 2A)
        # Ensures all loaded sensor libraries have entries in sensor_type_defaults.
        # New libraries get defaults based on their RECOMMENDED_* class attributes.
        # Runs on every startup - idempotent (skips existing entries).
        logger.info("Running sensor type auto-registration...")
        try:
            from .services.sensor_type_registration import auto_register_sensor_types

            async for session in get_session():
                reg_results = await auto_register_sensor_types(session)
                logger.info(
                    f"Sensor type auto-registration: "
                    f"{reg_results['newly_registered']} new, "
                    f"{reg_results['already_registered']} existing, "
                    f"{reg_results['failed']} failed"
                )
                break  # Exit after first session
        except Exception as e:
            # Non-fatal: System can work with system-defaults fallback
            logger.warning(f"Sensor type auto-registration failed (non-critical): {e}")

        # Step 3.7: Recover Scheduled Sensor Jobs (Phase 2H)
        # Recreates APScheduler jobs for sensors with operating_mode='scheduled'.
        # Jobs are stored in sensor.schedule_config (cron expressions).
        # Missed jobs during server downtime are NOT caught up (only future runs).
        logger.info("Recovering scheduled sensor jobs...")
        try:
            from .db.repositories.esp_repo import ESPRepository
            from .db.repositories.sensor_repo import SensorRepository
            from .services.sensor_scheduler_service import SensorSchedulerService

            async for session in get_session():
                sensor_repo = SensorRepository(session)
                esp_repo = ESPRepository(session)
                publisher = Publisher()

                sensor_scheduler_service = SensorSchedulerService(
                    sensor_repo=sensor_repo,
                    esp_repo=esp_repo,
                    publisher=publisher,
                )

                recovered_count = await sensor_scheduler_service.recover_all_jobs(session)
                logger.info(
                    f"Sensor schedule recovery complete: {recovered_count} jobs"
                )
                break  # Exit after first session
        except Exception as e:
            # Non-fatal: Scheduled sensors won't auto-trigger, but manual trigger still works
            logger.warning(f"Sensor schedule recovery failed (non-critical): {e}")

        # Step 4: Subscribe to all topics (only if connected)
        if connected:
            logger.info("Subscribing to MQTT topics...")
            _subscriber_instance.subscribe_all()
            logger.info("MQTT subscriptions complete")
        else:
            logger.info("Skipping initial subscription (not connected) - will subscribe on reconnect")

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
            hysteresis_evaluator = HysteresisConditionEvaluator()
            compound_evaluator = CompoundConditionEvaluator([sensor_evaluator, time_evaluator, hysteresis_evaluator])
            condition_evaluators = [sensor_evaluator, time_evaluator, hysteresis_evaluator, compound_evaluator]

            # Setup action executors
            actuator_executor = ActuatorActionExecutor(actuator_service)
            delay_executor = DelayActionExecutor()
            notification_executor = NotificationActionExecutor(_websocket_manager)

            # Phase 3: Sequence Executor (requires circular dependency resolution)
            global _sequence_executor
            _sequence_executor = SequenceActionExecutor(websocket_manager=_websocket_manager)

            action_executors = [
                actuator_executor,
                delay_executor,
                notification_executor,
                _sequence_executor,
            ]

            # KRITISCH: Circular-Dependency auflösen
            # SequenceExecutor braucht Zugriff auf andere Executors für Sub-Actions
            _sequence_executor.set_action_executors(action_executors)

            # Setup safety components
            from .services.logic.safety.conflict_manager import ConflictManager
            from .services.logic.safety.rate_limiter import RateLimiter

            conflict_manager = ConflictManager()
            rate_limiter = RateLimiter(logic_repo=logic_repo)

            # Initialize Logic Engine
            _logic_engine = LogicEngine(
                logic_repo=logic_repo,
                actuator_service=actuator_service,
                websocket_manager=_websocket_manager,
                condition_evaluators=condition_evaluators,
                action_executors=action_executors,
                conflict_manager=conflict_manager,
                rate_limiter=rate_limiter,
            )
            await _logic_engine.start()
            
            # Initialize Logic Scheduler
            _logic_scheduler = LogicScheduler(
                _logic_engine,
                interval_seconds=settings.performance.logic_scheduler_interval_seconds,
            )
            await _logic_scheduler.start()
            
            # Set global instance for handlers
            from .services.logic_engine import set_logic_engine
            set_logic_engine(_logic_engine)
            
            logger.info("Services initialized successfully")
            break  # Exit after first session

        # Log resilience status
        resilience_status = get_health_status()
        logger.info(
            f"[resilience] Status: healthy={resilience_status['healthy']}, "
            f"breakers={resilience_status['summary']['total']} "
            f"(closed={resilience_status['summary']['closed']}, "
            f"open={resilience_status['summary']['open']})"
        )
        
        logger.info("=" * 60)
        logger.info("God-Kaiser Server Started Successfully")
        logger.info(f"Environment: {settings.environment}")
        logger.info(f"Log Level: {settings.log_level}")
        logger.info(f"MQTT Broker: {settings.mqtt.broker_host}:{settings.mqtt.broker_port}")
        logger.info("API Endpoints: /api/v1/auth, /api/v1/esp, /api/v1/sensors, /api/v1/actuators, /api/v1/logic, /api/v1/health")
        logger.info("Resilience: Circuit Breakers (mqtt, database, external_api) + Retry + Timeout")
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

        # Step 2.1: Stop SequenceActionExecutor cleanup task
        if _sequence_executor:
            logger.info("Stopping SequenceActionExecutor cleanup task...")
            await _sequence_executor.shutdown()
            logger.info("SequenceActionExecutor stopped")

        # Step 2.3: Stop MaintenanceService FIRST (before scheduler shutdown)
        logger.info("Stopping MaintenanceService...")
        try:
            from .services.maintenance import get_maintenance_service
            maintenance_service = get_maintenance_service()
            maintenance_service.stop()  # Entfernt Maintenance-Jobs
            logger.info("  MaintenanceService stopped")
        except RuntimeError:
            logger.debug("  MaintenanceService not initialized, skipping")
        except Exception as e:
            logger.warning(f"  MaintenanceService shutdown warning: {e}")

        # Step 2.4: Stop SimulationScheduler simulations (Paket X - before scheduler shutdown)
        # This ensures Mock-ESPs can send final MQTT messages before scheduler jobs are removed
        logger.info("Stopping Mock-ESP simulations...")
        try:
            stopped_count = await _simulation_scheduler.stop_all_mocks()
            logger.info(f"  Mock-ESP shutdown: {stopped_count} simulations stopped")
        except Exception as e:
            logger.warning(f"  SimulationScheduler shutdown warning: {e}")

        # Step 2.5: Stop Central Scheduler AFTER Mocks (jobs can be removed safely now)
        logger.info("Stopping Central Scheduler...")
        try:
            from .core.scheduler import shutdown_central_scheduler
            scheduler_stats = await shutdown_central_scheduler()
            logger.info(f"  Central Scheduler: {scheduler_stats.get('jobs_removed', 0)} jobs removed")
        except Exception as e:
            logger.warning(f"  Central Scheduler shutdown warning: {e}")

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
        
        # Step 5: Disconnect MQTT client (always stop loop, even if not connected)
        logger.info("Disconnecting MQTT client...")
        mqtt_client = MQTTClient.get_instance()
        mqtt_client.disconnect()  # Always call - stops background thread even if not connected
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
        {"name": "zone", "description": "Zone Assignment & Management"},
        {"name": "subzone", "description": "Subzone Management & Safe-Mode Control"},
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

# Register global exception handlers (Paket X)
app.add_exception_handler(GodKaiserException, automation_one_exception_handler)
app.add_exception_handler(Exception, general_exception_handler)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "god_kaiser_server.src.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.environment == "development",
        log_level=settings.log_level.lower(),
    )
