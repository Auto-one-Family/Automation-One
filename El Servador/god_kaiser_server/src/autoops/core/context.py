"""
AutoOps Context - Shared state across plugin executions.

The context holds:
- User-provided configuration (sensors, preferences)
- Current system state (discovered ESPs, health)
- Execution history (what was done, what failed)
- User answers to questions
"""

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional


@dataclass
class SensorSpec:
    """User-specified sensor to configure."""

    sensor_type: str  # DS18B20, SHT31, PH, etc.
    name: Optional[str] = None  # Human-readable name
    gpio: Optional[int] = None  # Specific GPIO (None = auto-assign)
    count: int = 1  # How many of this type
    interface_type: Optional[str] = None  # I2C, ONEWIRE, ANALOG, DIGITAL
    i2c_address: Optional[int] = None
    onewire_address: Optional[str] = None
    raw_value: float = 0.0  # Initial value for mock sensors
    unit: str = ""  # Unit of measurement
    interval_seconds: float = 30.0  # Reading interval


@dataclass
class ActuatorSpec:
    """User-specified actuator to configure."""

    actuator_type: str  # relay, pump, valve, pwm_fan, etc.
    name: Optional[str] = None
    gpio: Optional[int] = None
    count: int = 1
    initial_state: bool = False
    pwm_value: float = 0.0


@dataclass
class ESPSpec:
    """Full specification for an ESP to configure."""

    name: Optional[str] = None
    device_id: Optional[str] = None  # Auto-generated if None
    hardware_type: str = "ESP32_WROOM"  # ESP32_WROOM, XIAO_ESP32_C3, MOCK_ESP32
    zone_name: Optional[str] = None
    sensors: list[SensorSpec] = field(default_factory=list)
    actuators: list[ActuatorSpec] = field(default_factory=list)
    auto_heartbeat: bool = True
    heartbeat_interval: int = 60


@dataclass
class SystemSnapshot:
    """Snapshot of the current system state."""

    timestamp: str = ""
    esp_devices: list[dict[str, Any]] = field(default_factory=list)
    total_sensors: int = 0
    total_actuators: int = 0
    online_devices: int = 0
    offline_devices: int = 0
    zones: list[str] = field(default_factory=list)
    server_health: dict[str, Any] = field(default_factory=dict)
    mqtt_connected: bool = False


@dataclass
class AutoOpsContext:
    """
    Shared context for AutoOps agent execution.

    Passed to every plugin and maintained across the session.
    """

    # Server connection
    server_url: str = "http://localhost:8000"
    auth_token: Optional[str] = None
    username: str = "admin"
    password: str = "admin"

    # User-provided specs
    esp_specs: list[ESPSpec] = field(default_factory=list)

    # User answers to questions
    user_answers: dict[str, Any] = field(default_factory=dict)

    # System state
    system_snapshot: Optional[SystemSnapshot] = None

    # Execution tracking
    session_id: str = ""
    started_at: str = ""
    actions_log: list[dict[str, Any]] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)

    # Configuration
    dry_run: bool = False
    verbose: bool = True
    auto_approve: bool = False  # Skip confirmation for destructive actions

    # Results from previous plugin runs (shared between plugins)
    created_devices: list[dict[str, Any]] = field(default_factory=list)
    configured_sensors: list[dict[str, Any]] = field(default_factory=list)
    configured_actuators: list[dict[str, Any]] = field(default_factory=list)
    diagnosed_issues: list[dict[str, Any]] = field(default_factory=list)
    fixed_issues: list[dict[str, Any]] = field(default_factory=list)

    def __post_init__(self):
        if not self.session_id:
            import uuid

            self.session_id = str(uuid.uuid4())[:8]
        if not self.started_at:
            self.started_at = datetime.now(timezone.utc).isoformat()

    def log_action(self, action: str, target: str, result: str, details: dict | None = None):
        """Log an action to the execution history."""
        self.actions_log.append(
            {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "action": action,
                "target": target,
                "result": result,
                "details": details or {},
            }
        )

    def log_error(self, error: str):
        """Log an error."""
        self.errors.append(f"[{datetime.now(timezone.utc).isoformat()}] {error}")

    def get_summary(self) -> dict[str, Any]:
        """Get a summary of the current context state."""
        return {
            "session_id": self.session_id,
            "started_at": self.started_at,
            "server_url": self.server_url,
            "authenticated": self.auth_token is not None,
            "esp_specs_count": len(self.esp_specs),
            "created_devices": len(self.created_devices),
            "configured_sensors": len(self.configured_sensors),
            "configured_actuators": len(self.configured_actuators),
            "diagnosed_issues": len(self.diagnosed_issues),
            "fixed_issues": len(self.fixed_issues),
            "total_actions": len(self.actions_log),
            "total_errors": len(self.errors),
        }
