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


class DevelopmentSettings(BaseSettings):
    """Development and testing settings"""

    debug_mode: bool = Field(default=False, alias="DEBUG_MODE")
    testing_mode: bool = Field(default=False, alias="TESTING_MODE")
    mock_esp32_enabled: bool = Field(default=False, alias="MOCK_ESP32_ENABLED")

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
    development: DevelopmentSettings = DevelopmentSettings()
    
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
