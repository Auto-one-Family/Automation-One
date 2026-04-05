"""
Actuator Business Logic Service

Business logic for actuator control, safety checks, command validation.
"""

import uuid
from dataclasses import dataclass
from math import isclose

from ..core.logging_config import get_logger
from ..core.metrics import increment_actuator_timeout
from ..db.repositories import ActuatorRepository, ESPRepository
from ..db.repositories.audit_log_repo import AuditLogRepository
from ..db.repositories.command_contract_repo import CommandContractRepository
from ..db.session import get_session
from ..mqtt.publisher import Publisher
from .safety_service import SafetyService

logger = get_logger(__name__)


@dataclass(frozen=True)
class ActuatorSendCommandResult:
    """
    Outcome of ActuatorService.send_command (single request trace).

    correlation_id is generated once per call and matches MQTT / WebSocket payloads
    when a publish is attempted; for no-op skips it still identifies the REST/logic trace.
    """

    success: bool
    correlation_id: str
    command_sent: bool
    safety_warnings: list[str]


class ActuatorService:
    """
    Actuator Business Logic Service.

    Handles actuator command execution with safety validation.
    """

    def __init__(
        self,
        actuator_repo: ActuatorRepository,
        safety_service: SafetyService,
        publisher: Publisher,
    ):
        """
        Initialize Actuator Service.

        Args:
            actuator_repo: ActuatorRepository instance
            safety_service: SafetyService instance
            publisher: MQTT Publisher instance
        """
        self.actuator_repo = actuator_repo
        self.safety_service = safety_service
        self.publisher = publisher

    async def _iter_command_sessions(self):
        """
        Yield (session, actuator_repo) for DB work.

        Per-request FastAPI deps inject a live session — reuse it so REST/tests see the same DB.
        Global LogicEngine instance holds a closed startup session — fall back to get_session().
        """
        if self.actuator_repo.session.is_active:
            yield self.actuator_repo.session, self.actuator_repo
            return
        async for session in get_session():
            yield session, ActuatorRepository(session)
            break

    async def send_command(
        self,
        esp_id: str,
        gpio: int,
        command: str,
        value: float = 1.0,
        duration: int = 0,
        issued_by: str = "logic_engine",
    ) -> ActuatorSendCommandResult:
        """
        Send actuator command with safety validation.

        Flow:
        1. Validate command via SafetyService
        2. Lookup actuator config
        3. Publish MQTT command
        4. Log command to history

        Args:
            esp_id: ESP device ID
            gpio: GPIO pin number
            command: Command type (ON, OFF, PWM, TOGGLE)
            value: Command value (0.0-1.0 for PWM, 1.0 for ON, 0.0 for OFF)
            duration: Duration in seconds (0 = unlimited)
            issued_by: Who issued the command (e.g., "logic_engine", "user:123", "system")

        Returns:
            ActuatorSendCommandResult with success, correlation_id, command_sent (MQTT publish),
            and safety_warnings from SafetyService when valid=True.
        """
        correlation_id = str(uuid.uuid4())
        try:
            # Step 1: Safety validation (CRITICAL - MUST be called before every command!)
            safety_result = await self.safety_service.validate_actuator_command(
                esp_id=esp_id,
                gpio=gpio,
                command=command,
                value=value,
            )
            warnings = list(safety_result.warnings or [])

            if not safety_result.valid:
                logger.error(
                    f"Actuator command rejected by safety check: esp_id={esp_id}, "
                    f"gpio={gpio}, command={command}, error={safety_result.error}"
                )

                # Log failed command attempt
                async for session, actuator_repo in self._iter_command_sessions():
                    esp_repo = ESPRepository(session)
                    esp_device = await esp_repo.get_by_device_id(esp_id)
                    if esp_device:
                        await actuator_repo.log_command(
                            esp_id=esp_device.id,
                            gpio=gpio,
                            actuator_type="unknown",  # Will be updated from config if available
                            command_type=command,
                            value=value,
                            success=False,
                            issued_by=issued_by,
                            error_message=safety_result.error,
                        )
                        # Audit log: safety check failed
                        audit_repo = AuditLogRepository(session)
                        await audit_repo.log_actuator_command(
                            esp_id=esp_id,
                            gpio=gpio,
                            command=command,
                            value=value,
                            issued_by=issued_by,
                            success=False,
                            error_message=f"Safety check failed: {safety_result.error}",
                            correlation_id=correlation_id,
                        )
                        await session.commit()
                    break

                # WebSocket broadcast: command failed
                try:
                    from ..websocket.manager import WebSocketManager

                    ws_manager = await WebSocketManager.get_instance()
                    await ws_manager.broadcast(
                        "actuator_command_failed",
                        {
                            "esp_id": esp_id,
                            "gpio": gpio,
                            "command": command,
                            "error": safety_result.error,
                            "issued_by": issued_by,
                            "correlation_id": correlation_id,
                        },
                    )
                except Exception:
                    pass  # WebSocket broadcast is best-effort

                return ActuatorSendCommandResult(
                    success=False,
                    correlation_id=correlation_id,
                    command_sent=False,
                    safety_warnings=[],
                )

            # Log warnings if any
            if safety_result.warnings:
                for warning in safety_result.warnings:
                    logger.warning(
                        f"Actuator command warning: esp_id={esp_id}, gpio={gpio}, {warning}"
                    )

            # Step 2: Get actuator config for logging
            async for session, actuator_repo in self._iter_command_sessions():
                esp_repo = ESPRepository(session)

                esp_device = await esp_repo.get_by_device_id(esp_id)
                if not esp_device:
                    logger.error(f"ESP device not found: {esp_id}")
                    return ActuatorSendCommandResult(
                        success=False,
                        correlation_id=correlation_id,
                        command_sent=False,
                        safety_warnings=warnings,
                    )

                actuator_config = await actuator_repo.get_by_esp_and_gpio(esp_device.id, gpio)
                actuator_type = actuator_config.actuator_type if actuator_config else "unknown"

                # Reconnect-safe delta guard: if desired output already equals current
                # hardware projection, do not send a duplicate command.
                current_state = await actuator_repo.get_state(esp_device.id, gpio)
                if self._is_noop_delta(command=command, value=value, current_state=current_state):
                    logger.info(
                        "Skipping no-op actuator command (desired==current): esp_id=%s gpio=%s command=%s value=%s",
                        esp_id,
                        gpio,
                        command,
                        value,
                    )
                    await actuator_repo.log_command(
                        esp_id=esp_device.id,
                        gpio=gpio,
                        actuator_type=actuator_type,
                        command_type=command,
                        value=value,
                        success=True,
                        issued_by=f"{issued_by}:noop_delta",
                        metadata={"skipped": "desired_equals_current"},
                    )
                    await session.commit()
                    return ActuatorSendCommandResult(
                        success=True,
                        correlation_id=correlation_id,
                        command_sent=False,
                        safety_warnings=warnings,
                    )

                # Step 3: Publish MQTT command
                # CRITICAL: value must be 0.0-1.0 (ESP32 converts internally to 0-255)
                success = self.publisher.publish_actuator_command(
                    esp_id=esp_id,
                    gpio=gpio,
                    command=command,
                    value=value,  # Already validated as 0.0-1.0
                    duration=duration,
                    retry=True,
                    correlation_id=correlation_id,
                )

                if not success:
                    increment_actuator_timeout()
                    logger.error(
                        f"Failed to publish actuator command: esp_id={esp_id}, gpio={gpio}"
                    )

                    # Log failed command
                    await actuator_repo.log_command(
                        esp_id=esp_device.id,
                        gpio=gpio,
                        actuator_type=actuator_type,
                        command_type=command,
                        value=value,
                        success=False,
                        issued_by=issued_by,
                        error_message="MQTT publish failed",
                    )
                    # Audit log: MQTT publish failed
                    audit_repo = AuditLogRepository(session)
                    await audit_repo.log_actuator_command(
                        esp_id=esp_id,
                        gpio=gpio,
                        command=command,
                        value=value,
                        issued_by=issued_by,
                        success=False,
                        error_message="MQTT publish failed",
                        correlation_id=correlation_id,
                    )
                    await session.commit()

                    # WebSocket broadcast: MQTT publish failed
                    try:
                        from ..websocket.manager import WebSocketManager

                        ws_manager = await WebSocketManager.get_instance()
                        await ws_manager.broadcast(
                            "actuator_command_failed",
                            {
                                "esp_id": esp_id,
                                "gpio": gpio,
                                "command": command,
                                "value": value,
                                "error": "MQTT publish failed",
                                "issued_by": issued_by,
                                "correlation_id": correlation_id,
                            },
                        )
                    except Exception:
                        pass  # WebSocket broadcast is best-effort

                    return ActuatorSendCommandResult(
                        success=False,
                        correlation_id=correlation_id,
                        command_sent=False,
                        safety_warnings=warnings,
                    )

                contract_repo = CommandContractRepository(session)
                await contract_repo.record_intent_publish_sent(
                    intent_id=correlation_id,
                    correlation_id=correlation_id,
                    esp_id=esp_id,
                    flow="command",
                )

                # Step 4: Log successful command
                await actuator_repo.log_command(
                    esp_id=esp_device.id,
                    gpio=gpio,
                    actuator_type=actuator_type,
                    command_type=command,
                    value=value,
                    success=True,
                    issued_by=issued_by,
                    metadata={
                        "duration": duration,
                        "safety_warnings": safety_result.warnings,
                    },
                )
                # Audit log: command sent successfully
                audit_repo = AuditLogRepository(session)
                await audit_repo.log_actuator_command(
                    esp_id=esp_id,
                    gpio=gpio,
                    command=command,
                    value=value,
                    issued_by=issued_by,
                    success=True,
                    correlation_id=correlation_id,
                )
                await session.commit()

                # WebSocket broadcast: command sent
                try:
                    from ..websocket.manager import WebSocketManager

                    ws_manager = await WebSocketManager.get_instance()
                    await ws_manager.broadcast(
                        "actuator_command",
                        {
                            "esp_id": esp_id,
                            "gpio": gpio,
                            "command": command,
                            "value": value,
                            "issued_by": issued_by,
                            "correlation_id": correlation_id,
                        },
                    )
                except Exception:
                    pass  # WebSocket broadcast is best-effort

                logger.info(
                    f"Actuator command sent: esp_id={esp_id}, gpio={gpio}, "
                    f"command={command}, value={value}, duration={duration}, "
                    f"issued_by={issued_by}"
                )

                return ActuatorSendCommandResult(
                    success=True,
                    correlation_id=correlation_id,
                    command_sent=True,
                    safety_warnings=warnings,
                )

        except Exception as e:
            logger.error(
                f"Error sending actuator command: {e}",
                exc_info=True,
            )
            return ActuatorSendCommandResult(
                success=False,
                correlation_id=correlation_id,
                command_sent=False,
                safety_warnings=[],
            )

    @staticmethod
    def _is_noop_delta(command: str, value: float, current_state) -> bool:
        """Return True when command would not change actuator state."""
        if current_state is None:
            return False

        desired_command = str(command or "").upper()
        current_name = str(getattr(current_state, "state", "") or "").lower()
        current_value = float(getattr(current_state, "current_value", 0.0) or 0.0)

        if desired_command == "TOGGLE":
            return False
        if desired_command == "OFF":
            return current_name == "off" or isclose(current_value, 0.0, abs_tol=0.01)
        if desired_command == "ON":
            return current_name in ("on", "pwm") and current_value > 0.0
        if desired_command == "PWM":
            return current_name == "pwm" and isclose(current_value, float(value), abs_tol=0.01)

        return False
