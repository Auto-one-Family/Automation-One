"""
Sensor Models: SensorConfig, SensorData
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
    gpio: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        doc="GPIO pin number",
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

    # Relationships
    esp: Mapped["ESPDevice"] = relationship(
        "ESPDevice",
        back_populates="sensors",
        doc="ESP device this sensor belongs to",
    )

    # Table Constraints
    __table_args__ = (
        UniqueConstraint("esp_id", "gpio", name="unique_esp_gpio_sensor"),
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
