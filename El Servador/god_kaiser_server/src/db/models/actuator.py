"""
Actuator Models: ActuatorConfig, ActuatorState, ActuatorHistory
"""

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Index, Integer, JSON, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..base import Base, TimestampMixin


class ActuatorConfig(Base, TimestampMixin):
    """
    Actuator Configuration Model.

    Stores configuration for actuators attached to ESP32 devices.
    Each actuator is uniquely identified by (esp_id, gpio) combination.

    Attributes:
        id: Primary key (UUID)
        esp_id: Foreign key to ESP device
        gpio: GPIO pin number
        actuator_type: Type of actuator (pump, valve, pwm, relay)
        actuator_name: Human-readable actuator name
        enabled: Whether actuator is active
        min_value: Minimum allowed value (PWM: 0.0, Relay: 0.0)
        max_value: Maximum allowed value (PWM: 1.0, Relay: 1.0)
        default_value: Default value when activated
        timeout_seconds: Auto-shutoff timeout (safety feature)
        safety_constraints: JSON safety constraints (max_runtime, cooldown, etc.)
        metadata: Additional actuator metadata
    """

    __tablename__ = "actuator_configs"

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

    # Actuator Information
    actuator_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        index=True,
        doc="Type of actuator (pump, valve, pwm, relay)",
    )

    actuator_name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        doc="Human-readable actuator name",
    )

    enabled: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
        doc="Whether actuator is active",
    )

    # Value Constraints (CRITICAL for Safety!)
    min_value: Mapped[float] = mapped_column(
        Float,
        default=0.0,
        nullable=False,
        doc="Minimum allowed value (PWM: 0.0, Relay: 0.0)",
    )

    max_value: Mapped[float] = mapped_column(
        Float,
        default=1.0,
        nullable=False,
        doc="Maximum allowed value (PWM: 1.0, Relay: 1.0)",
    )

    default_value: Mapped[float] = mapped_column(
        Float,
        default=0.0,
        nullable=False,
        doc="Default value when activated",
    )

    # Safety Features (CRITICAL!)
    timeout_seconds: Mapped[Optional[int]] = mapped_column(
        Integer,
        nullable=True,
        doc="Auto-shutoff timeout in seconds (None = no timeout)",
    )

    safety_constraints: Mapped[Optional[dict]] = mapped_column(
        JSON,
        nullable=True,
        doc="Safety constraints (max_runtime, cooldown_period, emergency_stop_priority)",
    )

    # Metadata
    actuator_metadata: Mapped[dict] = mapped_column(
        JSON,
        default=dict,
        nullable=False,
        doc="Additional actuator metadata",
    )

    # Relationships
    esp: Mapped["ESPDevice"] = relationship(
        "ESPDevice",
        back_populates="actuators",
        doc="ESP device this actuator belongs to",
    )

    # Table Constraints
    __table_args__ = (
        UniqueConstraint("esp_id", "gpio", name="unique_esp_gpio_actuator"),
        Index("idx_actuator_type_enabled", "actuator_type", "enabled"),
    )

    def __repr__(self) -> str:
        return (
            f"<ActuatorConfig(actuator_name='{self.actuator_name}', "
            f"type='{self.actuator_type}', gpio={self.gpio})>"
        )


class ActuatorState(Base):
    """
    Actuator State Model (Real-Time State).

    Stores the current state of actuators. Updated frequently during operation.
    Does NOT use TimestampMixin for performance (no created_at/updated_at).

    Attributes:
        id: Primary key (UUID)
        esp_id: Foreign key to ESP device
        gpio: GPIO pin number
        actuator_type: Type of actuator
        current_value: Current value (PWM: 0.0-1.0, Relay: 0.0/1.0)
        target_value: Target value (for gradual transitions)
        state: Actuator state (idle, active, error, emergency_stop)
        last_command_timestamp: Timestamp of last command
        runtime_seconds: Total runtime since last activation
        metadata: Additional state metadata (warnings, errors, etc.)
    """

    __tablename__ = "actuator_states"

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

    # Actuator Information
    gpio: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        doc="GPIO pin number",
    )

    actuator_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        doc="Type of actuator",
    )

    # Values
    current_value: Mapped[float] = mapped_column(
        Float,
        nullable=False,
        doc="Current value (PWM: 0.0-1.0, Relay: 0.0/1.0)",
    )

    target_value: Mapped[Optional[float]] = mapped_column(
        Float,
        nullable=True,
        doc="Target value (for gradual transitions)",
    )

    # State Information
    state: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        index=True,
        doc="Actuator state (idle, active, error, emergency_stop)",
    )

    last_command_timestamp: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        nullable=True,
        doc="Timestamp of last command",
    )

    runtime_seconds: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
        doc="Total runtime since last activation (seconds)",
    )

    # Last Command
    last_command: Mapped[Optional[str]] = mapped_column(
        String(50),
        nullable=True,
        doc="Last command issued (on, off, pwm, etc.)",
    )

    # Error Message
    error_message: Mapped[Optional[str]] = mapped_column(
        String(500),
        nullable=True,
        doc="Error message if actuator is in error state",
    )

    # Metadata
    state_metadata: Mapped[Optional[dict]] = mapped_column(
        JSON,
        nullable=True,
        doc="Additional state metadata (warnings, errors, etc.)",
    )

    # Optimized Indices for State Queries
    __table_args__ = (
        Index("idx_esp_gpio_state", "esp_id", "gpio"),
        Index("idx_actuator_state", "state"),
        Index("idx_esp_state", "esp_id", "state"),
    )

    def __repr__(self) -> str:
        return (
            f"<ActuatorState(gpio={self.gpio}, "
            f"state='{self.state}', value={self.current_value})>"
        )


class ActuatorHistory(Base):
    """
    Actuator Command History (Time-Series).

    Stores history of actuator commands for auditing and analytics.
    Optimized for high-volume inserts with time-based indices.

    Attributes:
        id: Primary key (UUID)
        esp_id: Foreign key to ESP device
        gpio: GPIO pin number
        actuator_type: Type of actuator
        command_type: Command type (set, stop, emergency_stop)
        value: Command value (None for stop commands)
        issued_by: User/system that issued command
        success: Whether command succeeded
        error_message: Error message if failed
        timestamp: Command timestamp
        metadata: Additional command metadata
    """

    __tablename__ = "actuator_history"

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

    # Actuator Information
    gpio: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        doc="GPIO pin number",
    )

    actuator_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        doc="Type of actuator",
    )

    # Command Information
    command_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        index=True,
        doc="Command type (set, stop, emergency_stop)",
    )

    value: Mapped[Optional[float]] = mapped_column(
        Float,
        nullable=True,
        doc="Command value (None for stop commands)",
    )

    issued_by: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
        doc="User/system that issued command (user:123, logic:456, system)",
    )

    # Result
    success: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        doc="Whether command succeeded",
    )

    error_message: Mapped[Optional[str]] = mapped_column(
        String(500),
        nullable=True,
        doc="Error message if command failed",
    )

    # Timestamp (CRITICAL for Time-Series!)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        index=True,
        default=datetime.utcnow,
        doc="Command timestamp",
    )

    # Metadata
    command_metadata: Mapped[Optional[dict]] = mapped_column(
        JSON,
        nullable=True,
        doc="Additional command metadata (request_id, retry_count, etc.)",
    )

    # Time-Series Optimized Indices
    __table_args__ = (
        Index("idx_esp_gpio_timestamp_hist", "esp_id", "gpio", "timestamp"),
        Index("idx_command_type_timestamp", "command_type", "timestamp"),
        Index("idx_timestamp_desc_hist", "timestamp", postgresql_ops={"timestamp": "DESC"}),
        Index("idx_success_timestamp", "success", "timestamp"),
    )

    def __repr__(self) -> str:
        return (
            f"<ActuatorHistory(gpio={self.gpio}, "
            f"command='{self.command_type}', success={self.success}, "
            f"timestamp='{self.timestamp.isoformat()}')>"
        )
