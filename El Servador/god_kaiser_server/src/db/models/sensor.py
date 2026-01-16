"""
Sensor Models: SensorConfig, SensorData

Phase 2A: Added operating mode fields for per-sensor override of type defaults.
"""

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Index, Integer, JSON, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..base import Base, TimestampMixin
from .enums import DataSource


class SensorConfig(Base, TimestampMixin):
    """
    Sensor Configuration Model.

    Stores configuration for sensors attached to ESP32 devices.
    Each sensor is uniquely identified by (esp_id, gpio) combination.

    Attributes:
        id: Primary key (UUID)
        esp_id: Foreign key to ESP device
        gpio: GPIO pin number
        sensor_type: Type of sensor (temperature, humidity, ph, etc.)
        sensor_name: Human-readable sensor name
        enabled: Whether sensor is active
        pi_enhanced: Whether to use Pi-Enhanced processing
        sample_interval_ms: Sampling interval in milliseconds
        calibration_data: JSON calibration parameters
        thresholds: JSON alert thresholds
    """

    __tablename__ = "sensor_configs"

    # Primary Key
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        doc="Primary key (UUID)",
    )

    # Foreign Keys
    esp_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("esp_devices.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        doc="Foreign key to ESP device",
    )

    # Hardware Configuration
    gpio: Mapped[Optional[int]] = mapped_column(
        Integer,
        nullable=True,
        doc="GPIO pin number (nullable for I2C/OneWire bus devices)",
    )

    # Sensor Information
    sensor_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        index=True,
        doc="Type of sensor (temperature, humidity, ph, ec, moisture, etc.)",
    )

    sensor_name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        doc="Human-readable sensor name",
    )

    # =========================================================================
    # MULTI-VALUE SENSOR SUPPORT (I2C/OneWire)
    # =========================================================================
    # Interface type identifies how the sensor communicates with ESP32

    interface_type: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        doc="Interface type: I2C, ONEWIRE, ANALOG, DIGITAL",
    )

    i2c_address: Mapped[Optional[int]] = mapped_column(
        Integer,
        nullable=True,
        index=True,  # Indexed for fast I2C address conflict checks
        doc="I2C address (required for I2C sensors, e.g., 68 for 0x44)",
    )

    onewire_address: Mapped[Optional[str]] = mapped_column(
        String(16),
        nullable=True,
        doc="OneWire device address (required for OneWire sensors)",
    )

    provides_values: Mapped[Optional[list]] = mapped_column(
        JSON,
        nullable=True,
        doc="List of value types this sensor provides (for multi-value sensors, e.g., ['sht31_temp', 'sht31_humidity'])",
    )

    enabled: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
        doc="Whether sensor is active",
    )

    # Processing Mode (CRITICAL!)
    pi_enhanced: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
        doc="Whether to use Pi-Enhanced processing",
    )

    # Sampling Configuration
    sample_interval_ms: Mapped[int] = mapped_column(
        Integer,
        default=1000,
        nullable=False,
        doc="Sampling interval in milliseconds",
    )

    # Calibration & Thresholds
    calibration_data: Mapped[Optional[dict]] = mapped_column(
        JSON,
        nullable=True,
        doc="Calibration parameters (offset, scale, etc.)",
    )

    thresholds: Mapped[Optional[dict]] = mapped_column(
        JSON,
        nullable=True,
        doc="Alert thresholds (min, max, warning, critical)",
    )

    # Metadata
    sensor_metadata: Mapped[dict] = mapped_column(
        JSON,
        default=dict,
        nullable=False,
        doc="Additional sensor metadata",
    )

    # =========================================================================
    # OPERATING MODE CONFIGURATION (Phase 2A)
    # =========================================================================
    # These fields allow per-sensor override of type defaults.
    # NULL values mean "use type default" from sensor_type_defaults table.

    operating_mode: Mapped[Optional[str]] = mapped_column(
        String(20),
        nullable=True,  # NULL = use type default
        doc="Operating mode override: continuous, on_demand, scheduled, paused (NULL = use type default)",
    )

    timeout_seconds: Mapped[Optional[int]] = mapped_column(
        Integer,
        nullable=True,  # NULL = use type default
        doc="Timeout override in seconds (NULL = use type default, 0 = no timeout)",
    )

    timeout_warning_enabled: Mapped[Optional[bool]] = mapped_column(
        Boolean,
        nullable=True,  # NULL = use type default
        doc="Timeout warning override (NULL = use type default)",
    )

    schedule_config: Mapped[Optional[dict]] = mapped_column(
        JSON,
        nullable=True,
        doc="Schedule configuration for scheduled mode (cron expression or time list)",
    )

    last_manual_request: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        nullable=True,
        doc="Timestamp of last manual measurement request (for on_demand mode)",
    )

    # =========================================================================
    # CONFIG STATUS (Phase 4 - Detailed Config Feedback)
    # =========================================================================
    # Tracks the configuration status from ESP32 config_response.

    config_status: Mapped[Optional[str]] = mapped_column(
        String(20),
        default="pending",
        doc="Config status: pending, applied, failed",
    )

    config_error: Mapped[Optional[str]] = mapped_column(
        String(50),
        nullable=True,
        doc="Error code if config_status=failed (e.g., GPIO_CONFLICT)",
    )

    config_error_detail: Mapped[Optional[str]] = mapped_column(
        String(200),
        nullable=True,
        doc="Detailed error message if config_status=failed",
    )

    # Relationships
    esp: Mapped["ESPDevice"] = relationship(
        "ESPDevice",
        back_populates="sensors",
        doc="ESP device this sensor belongs to",
    )

    # Table Constraints
    # MULTI-VALUE SUPPORT: Erlaubt mehrere sensor_types pro GPIO
    # z.B. SHT31 auf GPIO 21: sht31_temp + sht31_humidity
    __table_args__ = (
        UniqueConstraint("esp_id", "gpio", "sensor_type", name="unique_esp_gpio_sensor_type"),
        Index("idx_sensor_type_enabled", "sensor_type", "enabled"),
    )

    def __repr__(self) -> str:
        return (
            f"<SensorConfig(sensor_name='{self.sensor_name}', "
            f"type='{self.sensor_type}', gpio={self.gpio})>"
        )


class SensorData(Base):
    """
    Sensor Data Model (Time-Series).

    Stores time-series sensor readings. Designed for high-volume inserts
    with optimized indices for time-based queries.

    Attributes:
        id: Primary key (UUID)
        esp_id: Foreign key to ESP device
        gpio: GPIO pin number
        sensor_type: Type of sensor
        raw_value: Raw ADC/digital reading
        processed_value: Processed value (after Pi-Enhanced processing)
        unit: Measurement unit
        processing_mode: Processing mode used
        quality: Data quality indicator
        timestamp: Reading timestamp
        metadata: Additional data metadata
    """

    __tablename__ = "sensor_data"

    # Primary Key
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        doc="Primary key (UUID)",
    )

    # Foreign Keys
    esp_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("esp_devices.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        doc="Foreign key to ESP device",
    )

    # Sensor Information
    gpio: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        doc="GPIO pin number",
    )

    sensor_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        doc="Type of sensor",
    )

    # Values
    raw_value: Mapped[float] = mapped_column(
        Float,
        nullable=False,
        doc="Raw ADC/digital reading from sensor",
    )

    processed_value: Mapped[Optional[float]] = mapped_column(
        Float,
        nullable=True,
        doc="Processed value (after Pi-Enhanced processing or calibration)",
    )

    unit: Mapped[Optional[str]] = mapped_column(
        String(20),
        nullable=True,
        doc="Measurement unit (°C, %, pH, etc.)",
    )

    # Processing Information
    processing_mode: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        doc="Processing mode (pi_enhanced, local, raw)",
    )

    quality: Mapped[Optional[str]] = mapped_column(
        String(20),
        nullable=True,
        doc="Data quality indicator (good, fair, poor, error)",
    )

    # Timestamp (CRITICAL for Time-Series!)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        index=True,
        default=datetime.utcnow,
        doc="Reading timestamp",
    )

    # Metadata
    sensor_metadata: Mapped[Optional[dict]] = mapped_column(
        JSON,
        nullable=True,
        doc="Additional reading metadata (warnings, errors, etc.)",
    )

    # Data Source Tracking (for mock/test/production distinction)
    data_source: Mapped[str] = mapped_column(
        String(20),
        default=DataSource.PRODUCTION.value,
        nullable=False,
        index=True,
        doc="Data source: production, mock, test, simulation",
    )

    # Time-Series Optimized Indices
    __table_args__ = (
        Index("idx_esp_gpio_timestamp", "esp_id", "gpio", "timestamp"),
        Index("idx_sensor_type_timestamp", "sensor_type", "timestamp"),
        Index("idx_timestamp_desc", "timestamp", postgresql_ops={"timestamp": "DESC"}),
        Index("idx_data_source_timestamp", "data_source", "timestamp"),
    )

    def __repr__(self) -> str:
        return (
            f"<SensorData(gpio={self.gpio}, "
            f"value={self.processed_value or self.raw_value}, "
            f"timestamp='{self.timestamp.isoformat()}')>"
        )
