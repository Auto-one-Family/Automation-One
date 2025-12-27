"""
Zentrale Konfiguration für God-Kaiser Server
Lädt Settings aus .env via Pydantic BaseSettings
"""

from functools import lru_cache
from typing import List, Optional

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class DatabaseSettings(BaseSettings):
    """Database configuration settings"""

    url: str = Field(
        default="postgresql+asyncpg://god_kaiser:password@localhost:5432/god_kaiser_db",
        alias="DATABASE_URL",
        description="Database connection URL",
    )
    pool_size: int = Field(default=10, alias="DATABASE_POOL_SIZE", ge=1, le=100)
    max_overflow: int = Field(default=20, alias="DATABASE_MAX_OVERFLOW", ge=0, le=100)
    pool_timeout: int = Field(default=30, alias="DATABASE_POOL_TIMEOUT", ge=1)
    echo: bool = Field(default=False, alias="DATABASE_ECHO")
    auto_init: bool = Field(
        default=True,
        alias="DATABASE_AUTO_INIT",
        description="Automatically initialize database tables on startup",
    )

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


class MQTTSettings(BaseSettings):
    """MQTT Broker configuration settings"""

    broker_host: str = Field(default="localhost", alias="MQTT_BROKER_HOST")
    broker_port: int = Field(default=1883, alias="MQTT_BROKER_PORT", ge=1, le=65535)
    websocket_port: int = Field(
        default=9001, alias="MQTT_WEBSOCKET_PORT", ge=1, le=65535
    )
    keepalive: int = Field(default=60, alias="MQTT_KEEPALIVE", ge=10)
    qos_sensor_data: int = Field(default=1, alias="MQTT_QOS_SENSOR_DATA", ge=0, le=2)
    qos_commands: int = Field(default=2, alias="MQTT_QOS_COMMANDS", ge=0, le=2)
    client_id: str = Field(default="god_kaiser_server", alias="MQTT_CLIENT_ID")
    username: Optional[str] = Field(default=None, alias="MQTT_USERNAME")
    password: Optional[str] = Field(default=None, alias="MQTT_PASSWORD")

    # TLS/SSL Configuration
    use_tls: bool = Field(default=False, alias="MQTT_USE_TLS")
    ca_cert_path: Optional[str] = Field(default=None, alias="MQTT_CA_CERT_PATH")
    client_cert_path: Optional[str] = Field(default=None, alias="MQTT_CLIENT_CERT_PATH")
    client_key_path: Optional[str] = Field(default=None, alias="MQTT_CLIENT_KEY_PATH")
    
    # Mosquitto Password File
    passwd_file_path: str = Field(
        default="/etc/mosquitto/passwd",
        alias="MQTT_PASSWD_FILE_PATH",
        description="Path to Mosquitto password file",
    )

    # Subscriber worker pool
    subscriber_max_workers: int = Field(
        default=10,
        alias="MQTT_SUBSCRIBER_MAX_WORKERS",
        ge=1,
        le=128,
        description="Max concurrent MQTT handler threads",
    )

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


class ServerSettings(BaseSettings):
    """Server configuration settings"""

    host: str = Field(default="0.0.0.0", alias="SERVER_HOST")
    port: int = Field(default=8000, alias="SERVER_PORT", ge=1, le=65535)
    reload: bool = Field(default=True, alias="SERVER_RELOAD")
    workers: int = Field(default=4, alias="SERVER_WORKERS", ge=1, le=32)
    log_level: str = Field(default="info", alias="SERVER_LOG_LEVEL")

    @field_validator("log_level")
    @classmethod
    def validate_log_level(cls, v: str) -> str:
        """Validate log level"""
        allowed = ["debug", "info", "warning", "error", "critical"]
        if v.lower() not in allowed:
            raise ValueError(f"log_level must be one of {allowed}")
        return v.lower()

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


class SecuritySettings(BaseSettings):
    """Security and authentication settings"""

    jwt_secret_key: str = Field(
        default="change-this-secret-key-in-production", alias="JWT_SECRET_KEY"
    )
    jwt_algorithm: str = Field(default="HS256", alias="JWT_ALGORITHM")
    jwt_access_token_expire_minutes: int = Field(
        default=30, alias="JWT_ACCESS_TOKEN_EXPIRE_MINUTES", ge=1
    )
    jwt_refresh_token_expire_days: int = Field(
        default=7, alias="JWT_REFRESH_TOKEN_EXPIRE_DAYS", ge=1
    )
    password_hash_algorithm: str = Field(default="bcrypt", alias="PASSWORD_HASH_ALGORITHM")
    password_min_length: int = Field(default=8, alias="PASSWORD_MIN_LENGTH", ge=6)

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


class CORSSettings(BaseSettings):
    """CORS configuration settings"""

    allowed_origins: List[str] = Field(
        default=["http://localhost:3000", "http://localhost:5173"],
        alias="CORS_ALLOWED_ORIGINS",
    )
    allow_credentials: bool = Field(default=True, alias="CORS_ALLOW_CREDENTIALS")
    allow_methods: List[str] = Field(
        default=["GET", "POST", "PUT", "DELETE", "PATCH"], alias="CORS_ALLOW_METHODS"
    )
    allow_headers: List[str] = Field(default=["*"], alias="CORS_ALLOW_HEADERS")

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


class HierarchySettings(BaseSettings):
    """God-Kaiser hierarchy settings"""

    kaiser_id: str = Field(default="god", alias="KAISER_ID")
    god_id: str = Field(default="god_pi_central", alias="GOD_ID")

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


class PerformanceSettings(BaseSettings):
    """Performance and monitoring settings"""

    management_enabled: bool = Field(default=True, alias="PERFORMANCE_MANAGEMENT_ENABLED")
    system_monitoring_enabled: bool = Field(
        default=True, alias="SYSTEM_MONITORING_ENABLED"
    )
    metrics_export_enabled: bool = Field(default=True, alias="METRICS_EXPORT_ENABLED")
    prometheus_port: int = Field(default=9090, alias="PROMETHEUS_PORT", ge=1, le=65535)
    logic_scheduler_interval_seconds: int = Field(
        default=60,
        alias="LOGIC_SCHEDULER_INTERVAL_SECONDS",
        ge=1,
        le=3600,
        description="Interval for timer-triggered logic evaluation",
    )

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


class LoggingSettings(BaseSettings):
    """Logging configuration settings"""

    level: str = Field(default="INFO", alias="LOG_LEVEL")
    format: str = Field(default="json", alias="LOG_FORMAT")
    file_path: str = Field(default="logs/god_kaiser.log", alias="LOG_FILE_PATH")
    file_max_bytes: int = Field(default=10485760, alias="LOG_FILE_MAX_BYTES", ge=1024)
    file_backup_count: int = Field(default=5, alias="LOG_FILE_BACKUP_COUNT", ge=0, le=100)

    @field_validator("level")
    @classmethod
    def validate_level(cls, v: str) -> str:
        """Validate log level"""
        allowed = ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]
        if v.upper() not in allowed:
            raise ValueError(f"log level must be one of {allowed}")
        return v.upper()

    @field_validator("format")
    @classmethod
    def validate_format(cls, v: str) -> str:
        """Validate log format"""
        allowed = ["json", "text"]
        if v.lower() not in allowed:
            raise ValueError(f"log format must be one of {allowed}")
        return v.lower()

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


class ESP32Settings(BaseSettings):
    """ESP32 integration settings"""

    discovery_enabled: bool = Field(default=True, alias="ESP_DISCOVERY_ENABLED")
    discovery_interval: int = Field(default=300, alias="ESP_DISCOVERY_INTERVAL", ge=10)
    heartbeat_timeout: int = Field(default=120, alias="ESP_HEARTBEAT_TIMEOUT", ge=30)
    connection_timeout: int = Field(default=30, alias="ESP_CONNECTION_TIMEOUT", ge=5)

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


class SensorSettings(BaseSettings):
    """Sensor processing settings"""

    pi_enhanced_enabled: bool = Field(
        default=True, alias="PI_ENHANCED_PROCESSING_ENABLED"
    )
    processing_timeout: int = Field(
        default=5000, alias="SENSOR_PROCESSING_TIMEOUT", ge=100
    )
    data_retention_days: int = Field(
        default=90, alias="SENSOR_DATA_RETENTION_DAYS", ge=1, le=3650
    )

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


class ActuatorSettings(BaseSettings):
    """Actuator control settings"""

    command_timeout: int = Field(default=10, alias="ACTUATOR_COMMAND_TIMEOUT", ge=1)
    emergency_stop_enabled: bool = Field(
        default=True, alias="EMERGENCY_STOP_ENABLED"
    )
    safety_checks_enabled: bool = Field(default=True, alias="SAFETY_CHECKS_ENABLED")

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


class WebSocketSettings(BaseSettings):
    """WebSocket configuration settings"""

    max_connections: int = Field(
        default=100, alias="WEBSOCKET_MAX_CONNECTIONS", ge=1, le=10000
    )
    heartbeat_interval: int = Field(
        default=30, alias="WEBSOCKET_HEARTBEAT_INTERVAL", ge=5
    )
    connection_timeout: int = Field(
        default=300, alias="WEBSOCKET_CONNECTION_TIMEOUT", ge=10
    )

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


class RedisSettings(BaseSettings):
    """Redis cache configuration (optional)"""

    enabled: bool = Field(default=False, alias="REDIS_ENABLED")
    host: str = Field(default="localhost", alias="REDIS_HOST")
    port: int = Field(default=6379, alias="REDIS_PORT", ge=1, le=65535)
    db: int = Field(default=0, alias="REDIS_DB", ge=0, le=15)
    password: Optional[str] = Field(default=None, alias="REDIS_PASSWORD")

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


class ExternalServicesSettings(BaseSettings):
    """External services configuration"""

    god_layer_url: str = Field(
        default="http://localhost:8001", alias="GOD_LAYER_URL"
    )
    god_layer_enabled: bool = Field(default=False, alias="GOD_LAYER_ENABLED")
    god_layer_timeout: int = Field(default=10, alias="GOD_LAYER_TIMEOUT", ge=1)

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


class NotificationSettings(BaseSettings):
    """Notification (email/webhook) settings"""

    smtp_enabled: bool = Field(default=False, alias="SMTP_ENABLED")
    smtp_host: str = Field(default="localhost", alias="SMTP_HOST")
    smtp_port: int = Field(default=587, alias="SMTP_PORT", ge=1, le=65535)
    smtp_username: Optional[str] = Field(default=None, alias="SMTP_USERNAME")
    smtp_password: Optional[str] = Field(default=None, alias="SMTP_PASSWORD")
    smtp_use_tls: bool = Field(default=True, alias="SMTP_USE_TLS")
    smtp_from: str = Field(default="noreply@god-kaiser.local", alias="SMTP_FROM")

    webhook_timeout_seconds: int = Field(
        default=5,
        alias="WEBHOOK_TIMEOUT_SECONDS",
        ge=1,
        le=60,
        description="Timeout for webhook notifications (seconds)",
    )

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


class DevelopmentSettings(BaseSettings):
    """Development and testing settings"""

    debug_mode: bool = Field(default=False, alias="DEBUG_MODE")
    testing_mode: bool = Field(default=False, alias="TESTING_MODE")
    mock_esp32_enabled: bool = Field(default=False, alias="MOCK_ESP32_ENABLED")
    allow_auth_bypass: bool = Field(
        default=False,
        alias="DEBUG_AUTH_BYPASS_ENABLED",
        description="Allow auth bypass in debug (never enable in production).",
    )

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


class MaintenanceSettings(BaseSettings):
    """
    Maintenance and cleanup settings (Data-Safe Version).
    
    WICHTIG: Alle Cleanup-Jobs sind per Default DISABLED!
    User muss explizit aktivieren um Datenverlust zu verhindern.
    """

    # ─────────────────────────────────────────────────────────
    # SENSOR DATA CLEANUP (DEFAULT: DISABLED)
    # ─────────────────────────────────────────────────────────
    sensor_data_retention_enabled: bool = Field(
        default=False,
        alias="SENSOR_DATA_RETENTION_ENABLED",
        description="⚠️ Enable sensor data cleanup (Default: DISABLED - unlimited retention)",
    )
    sensor_data_retention_days: int = Field(
        default=30,
        alias="SENSOR_DATA_RETENTION_DAYS",
        ge=1,
        le=3650,
        description="Days to keep sensor data (only used if retention_enabled=True)",
    )
    sensor_data_cleanup_dry_run: bool = Field(
        default=True,
        alias="SENSOR_DATA_CLEANUP_DRY_RUN",
        description="Safety: Dry-Run mode (counts only, no deletion) - Default: True",
    )
    sensor_data_cleanup_batch_size: int = Field(
        default=1000,
        alias="SENSOR_DATA_CLEANUP_BATCH_SIZE",
        ge=100,
        le=10000,
        description="Max records per batch (prevents DB locks)",
    )
    sensor_data_cleanup_max_batches: int = Field(
        default=100,
        alias="SENSOR_DATA_CLEANUP_MAX_BATCHES",
        ge=1,
        le=1000,
        description="Max batches per run (safety limit: max 100k records per run)",
    )

    # ─────────────────────────────────────────────────────────
    # COMMAND HISTORY CLEANUP (DEFAULT: DISABLED)
    # ─────────────────────────────────────────────────────────
    command_history_retention_enabled: bool = Field(
        default=False,
        alias="COMMAND_HISTORY_RETENTION_ENABLED",
        description="⚠️ Enable command history cleanup (Default: DISABLED - unlimited retention)",
    )
    command_history_retention_days: int = Field(
        default=14,
        alias="COMMAND_HISTORY_RETENTION_DAYS",
        ge=1,
        le=3650,
        description="Days to keep command history (only used if retention_enabled=True)",
    )
    command_history_cleanup_dry_run: bool = Field(
        default=True,
        alias="COMMAND_HISTORY_CLEANUP_DRY_RUN",
        description="Safety: Dry-Run mode (counts only, no deletion) - Default: True",
    )
    command_history_cleanup_batch_size: int = Field(
        default=1000,
        alias="COMMAND_HISTORY_CLEANUP_BATCH_SIZE",
        ge=100,
        le=10000,
        description="Max records per batch",
    )
    command_history_cleanup_max_batches: int = Field(
        default=50,
        alias="COMMAND_HISTORY_CLEANUP_MAX_BATCHES",
        ge=1,
        le=1000,
        description="Max batches per run",
    )

    # ─────────────────────────────────────────────────────────
    # AUDIT LOG CLEANUP (DEFAULT: DISABLED)
    # ─────────────────────────────────────────────────────────
    audit_log_retention_enabled: bool = Field(
        default=False,
        alias="AUDIT_LOG_RETENTION_ENABLED",
        description="⚠️ Enable audit log cleanup (Default: DISABLED - unlimited retention)",
    )
    audit_log_retention_days: int = Field(
        default=90,
        alias="AUDIT_LOG_RETENTION_DAYS",
        ge=1,
        le=3650,
        description="Days to keep audit logs (only used if retention_enabled=True)",
    )
    audit_log_cleanup_dry_run: bool = Field(
        default=True,
        alias="AUDIT_LOG_CLEANUP_DRY_RUN",
        description="Safety: Dry-Run mode (counts only, no deletion) - Default: True",
    )
    audit_log_cleanup_batch_size: int = Field(
        default=1000,
        alias="AUDIT_LOG_CLEANUP_BATCH_SIZE",
        ge=100,
        le=10000,
        description="Max records per batch",
    )
    audit_log_cleanup_max_batches: int = Field(
        default=200,
        alias="AUDIT_LOG_CLEANUP_MAX_BATCHES",
        ge=1,
        le=1000,
        description="Max batches per run",
    )

    # ─────────────────────────────────────────────────────────
    # ORPHANED MOCKS CLEANUP (DEFAULT: WARN ONLY)
    # ─────────────────────────────────────────────────────────
    orphaned_mock_cleanup_enabled: bool = Field(
        default=True,
        alias="ORPHANED_MOCK_CLEANUP_ENABLED",
        description="Enable cleanup of orphaned mock ESPs",
    )
    orphaned_mock_auto_delete: bool = Field(
        default=False,
        alias="ORPHANED_MOCK_AUTO_DELETE",
        description="⚠️ Auto-delete orphaned mocks (Default: False - only log warnings)",
    )
    orphaned_mock_age_hours: int = Field(
        default=24,
        alias="ORPHANED_MOCK_AGE_HOURS",
        ge=1,
        description="Age in hours before mock is considered orphaned",
    )

    # ─────────────────────────────────────────────────────────
    # HEALTH CHECKS (IMMER ENABLED - löschen keine Daten)
    # ─────────────────────────────────────────────────────────
    heartbeat_timeout_seconds: int = Field(
        default=180,
        alias="HEARTBEAT_TIMEOUT_SECONDS",
        ge=30,
        description="Seconds before ESP is considered offline (3x heartbeat interval)",
    )
    mqtt_health_check_interval_seconds: int = Field(
        default=30,
        alias="MQTT_HEALTH_CHECK_INTERVAL_SECONDS",
        ge=10,
        le=300,
        description="Interval for MQTT broker health checks",
    )
    esp_health_check_interval_seconds: int = Field(
        default=60,
        alias="ESP_HEALTH_CHECK_INTERVAL_SECONDS",
        ge=10,
        le=300,
        description="Interval for ESP health checks",
    )

    # ─────────────────────────────────────────────────────────
    # STATS AGGREGATION (IMMER ENABLED - löschen keine Daten)
    # ─────────────────────────────────────────────────────────
    stats_aggregation_enabled: bool = Field(
        default=True,
        alias="STATS_AGGREGATION_ENABLED",
        description="Enable statistics aggregation",
    )
    stats_aggregation_interval_minutes: int = Field(
        default=60,
        alias="STATS_AGGREGATION_INTERVAL_MINUTES",
        ge=1,
        le=1440,
        description="Interval for statistics aggregation (minutes)",
    )

    # ─────────────────────────────────────────────────────────
    # ADVANCED SAFETY FEATURES
    # ─────────────────────────────────────────────────────────
    cleanup_require_confirmation: bool = Field(
        default=True,
        alias="CLEANUP_REQUIRE_CONFIRMATION",
        description="Warn user on first cleanup run (safety feature)",
    )
    cleanup_alert_threshold_percent: float = Field(
        default=10.0,
        alias="CLEANUP_ALERT_THRESHOLD_PERCENT",
        ge=0.0,
        le=100.0,
        description="Alert if deletion exceeds this percentage of total records",
    )
    cleanup_max_records_per_run: int = Field(
        default=100000,
        alias="CLEANUP_MAX_RECORDS_PER_RUN",
        ge=1000,
        le=1000000,
        description="Safety limit: Max records deleted per cleanup run",
    )

    @field_validator("sensor_data_retention_days")
    @classmethod
    def validate_sensor_retention(cls, v: int, info) -> int:
        """Warne bei zu kurzer Retention-Period"""
        import logging
        logger = logging.getLogger(__name__)

        if v < 7 and info.data.get("sensor_data_retention_enabled"):
            logger.warning(
                f"SENSOR_DATA_RETENTION_DAYS={v} ist sehr kurz! "
                "Empfohlen: >= 7 Tage"
            )
        return v

    @field_validator("command_history_retention_days")
    @classmethod
    def validate_command_retention(cls, v: int, info) -> int:
        """Warne bei zu kurzer Retention-Period"""
        import logging
        logger = logging.getLogger(__name__)

        if v < 7 and info.data.get("command_history_retention_enabled"):
            logger.warning(
                f"COMMAND_HISTORY_RETENTION_DAYS={v} ist sehr kurz! "
                "Empfohlen: >= 7 Tage"
            )
        return v

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


class ResilienceSettings(BaseSettings):
    """
    Resilience Patterns Configuration (Circuit Breaker, Retry, Timeout)
    
    Provides fault tolerance settings for:
    - Circuit Breakers (MQTT, Database, External APIs)
    - Retry mechanisms with exponential backoff
    - Timeout handling for async operations
    - Offline buffer for graceful degradation
    """

    # ─────────────────────────────────────────────────────────
    # CIRCUIT BREAKER: MQTT
    # ─────────────────────────────────────────────────────────
    circuit_breaker_mqtt_failure_threshold: int = Field(
        default=5,
        alias="CIRCUIT_BREAKER_MQTT_FAILURE_THRESHOLD",
        ge=1,
        le=100,
        description="Failures before MQTT circuit breaker opens",
    )
    circuit_breaker_mqtt_recovery_timeout: int = Field(
        default=30,
        alias="CIRCUIT_BREAKER_MQTT_RECOVERY_TIMEOUT",
        ge=5,
        le=300,
        description="Seconds in OPEN before trying HALF_OPEN",
    )
    circuit_breaker_mqtt_half_open_timeout: int = Field(
        default=10,
        alias="CIRCUIT_BREAKER_MQTT_HALF_OPEN_TIMEOUT",
        ge=1,
        le=60,
        description="Seconds for test request in HALF_OPEN",
    )

    # ─────────────────────────────────────────────────────────
    # CIRCUIT BREAKER: DATABASE
    # ─────────────────────────────────────────────────────────
    circuit_breaker_db_failure_threshold: int = Field(
        default=3,
        alias="CIRCUIT_BREAKER_DB_FAILURE_THRESHOLD",
        ge=1,
        le=100,
        description="Failures before database circuit breaker opens",
    )
    circuit_breaker_db_recovery_timeout: int = Field(
        default=10,
        alias="CIRCUIT_BREAKER_DB_RECOVERY_TIMEOUT",
        ge=5,
        le=300,
        description="Seconds in OPEN before trying HALF_OPEN",
    )
    circuit_breaker_db_half_open_timeout: int = Field(
        default=5,
        alias="CIRCUIT_BREAKER_DB_HALF_OPEN_TIMEOUT",
        ge=1,
        le=60,
        description="Seconds for test request in HALF_OPEN",
    )

    # ─────────────────────────────────────────────────────────
    # CIRCUIT BREAKER: EXTERNAL API
    # ─────────────────────────────────────────────────────────
    circuit_breaker_api_failure_threshold: int = Field(
        default=5,
        alias="CIRCUIT_BREAKER_API_FAILURE_THRESHOLD",
        ge=1,
        le=100,
        description="Failures before external API circuit breaker opens",
    )
    circuit_breaker_api_recovery_timeout: int = Field(
        default=60,
        alias="CIRCUIT_BREAKER_API_RECOVERY_TIMEOUT",
        ge=5,
        le=600,
        description="Seconds in OPEN before trying HALF_OPEN",
    )
    circuit_breaker_api_half_open_timeout: int = Field(
        default=15,
        alias="CIRCUIT_BREAKER_API_HALF_OPEN_TIMEOUT",
        ge=1,
        le=120,
        description="Seconds for test request in HALF_OPEN",
    )

    # ─────────────────────────────────────────────────────────
    # RETRY CONFIGURATION
    # ─────────────────────────────────────────────────────────
    retry_max_attempts: int = Field(
        default=3,
        alias="RETRY_MAX_ATTEMPTS",
        ge=1,
        le=10,
        description="Maximum retry attempts for transient failures",
    )
    retry_base_delay: float = Field(
        default=1.0,
        alias="RETRY_BASE_DELAY",
        ge=0.1,
        le=30.0,
        description="Base delay in seconds for exponential backoff",
    )
    retry_max_delay: float = Field(
        default=30.0,
        alias="RETRY_MAX_DELAY",
        ge=1.0,
        le=300.0,
        description="Maximum delay cap in seconds",
    )
    retry_exponential_base: float = Field(
        default=2.0,
        alias="RETRY_EXPONENTIAL_BASE",
        ge=1.1,
        le=4.0,
        description="Base for exponential backoff calculation",
    )
    retry_jitter_enabled: bool = Field(
        default=True,
        alias="RETRY_JITTER_ENABLED",
        description="Add random jitter to prevent thundering herd",
    )

    # ─────────────────────────────────────────────────────────
    # TIMEOUT CONFIGURATION
    # ─────────────────────────────────────────────────────────
    timeout_mqtt_publish: float = Field(
        default=5.0,
        alias="TIMEOUT_MQTT_PUBLISH",
        ge=1.0,
        le=60.0,
        description="Timeout for MQTT publish operations",
    )
    timeout_db_query: float = Field(
        default=5.0,
        alias="TIMEOUT_DB_QUERY",
        ge=1.0,
        le=60.0,
        description="Timeout for simple database queries",
    )
    timeout_db_query_complex: float = Field(
        default=30.0,
        alias="TIMEOUT_DB_QUERY_COMPLEX",
        ge=5.0,
        le=120.0,
        description="Timeout for complex database queries (aggregations)",
    )
    timeout_external_api: float = Field(
        default=10.0,
        alias="TIMEOUT_EXTERNAL_API",
        ge=1.0,
        le=120.0,
        description="Timeout for external API calls",
    )
    timeout_websocket_send: float = Field(
        default=2.0,
        alias="TIMEOUT_WEBSOCKET_SEND",
        ge=0.5,
        le=30.0,
        description="Timeout for WebSocket send operations",
    )
    timeout_sensor_processing: float = Field(
        default=1.0,
        alias="TIMEOUT_SENSOR_PROCESSING",
        ge=0.1,
        le=10.0,
        description="Timeout for sensor data processing",
    )

    # ─────────────────────────────────────────────────────────
    # OFFLINE BUFFER CONFIGURATION
    # ─────────────────────────────────────────────────────────
    offline_buffer_max_size: int = Field(
        default=1000,
        alias="OFFLINE_BUFFER_MAX_SIZE",
        ge=100,
        le=10000,
        description="Maximum messages in offline buffer",
    )
    offline_buffer_flush_batch_size: int = Field(
        default=50,
        alias="OFFLINE_BUFFER_FLUSH_BATCH_SIZE",
        ge=10,
        le=500,
        description="Messages to flush per batch on reconnect",
    )

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


class Settings(BaseSettings):
    """Master settings class combining all configuration sections"""

    environment: str = Field(default="development", alias="ENVIRONMENT")
    log_level: str = Field(
        default="INFO",
        alias="LOG_LEVEL",
        description="Global log level (DEBUG, INFO, WARNING, ERROR, CRITICAL)",
    )

    # Sub-settings
    database: DatabaseSettings = DatabaseSettings()
    mqtt: MQTTSettings = MQTTSettings()
    server: ServerSettings = ServerSettings()
    security: SecuritySettings = SecuritySettings()
    cors: CORSSettings = CORSSettings()
    hierarchy: HierarchySettings = HierarchySettings()
    performance: PerformanceSettings = PerformanceSettings()
    logging: LoggingSettings = LoggingSettings()
    esp32: ESP32Settings = ESP32Settings()
    sensor: SensorSettings = SensorSettings()
    actuator: ActuatorSettings = ActuatorSettings()
    websocket: WebSocketSettings = WebSocketSettings()
    redis: RedisSettings = RedisSettings()
    external_services: ExternalServicesSettings = ExternalServicesSettings()
    notification: NotificationSettings = NotificationSettings()
    development: DevelopmentSettings = DevelopmentSettings()
    maintenance: MaintenanceSettings = MaintenanceSettings()
    resilience: ResilienceSettings = ResilienceSettings()
    
    @property
    def cors_origins(self) -> list[str]:
        """Get CORS allowed origins from CORSSettings"""
        return self.cors.allowed_origins

    @field_validator("environment")
    @classmethod
    def validate_environment(cls, v: str) -> str:
        """Validate environment"""
        allowed = ["development", "production", "testing"]
        if v.lower() not in allowed:
            raise ValueError(f"environment must be one of {allowed}")
        return v.lower()
    
    @field_validator("log_level")
    @classmethod
    def validate_log_level_global(cls, v: str) -> str:
        """Validate global log level"""
        allowed = ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]
        if v.upper() not in allowed:
            raise ValueError(f"log_level must be one of {allowed}")
        return v.upper()

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


@lru_cache()
def get_settings() -> Settings:
    """
    Get cached settings instance (Singleton pattern).

    Returns:
        Settings: Cached settings instance
    """
    return Settings()
