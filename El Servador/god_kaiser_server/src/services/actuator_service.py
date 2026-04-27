"""
Actuator Business Logic Service

Business logic for actuator control, safety checks, command validation.
"""

import uuid
from contextlib import asynccontextmanager
from dataclasses import dataclass
from math import isclose
from typing import AsyncIterator, Callable, Optional

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


@dataclass(frozen=True)
class ActuatorCommandContext:
    """Resolved actuator context for one command attempt."""

    esp_uuid: uuid.UUID
    actuator_type: str
    is_noop: bool


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
        session_factory: Callable = get_session,
    ):
        """
        Initialize Actuator Service.

        Args:
            actuator_repo: ActuatorRepository instance
            safety_service: SafetyService instance
            publisher: MQTT Publisher instance
            session_factory: async generator yielding AsyncSession
        """
        self.actuator_repo = actuator_repo
        self.safety_service = safety_service
        self.publisher = publisher
        self.session_factory = session_factory

    @asynccontextmanager
    async def _command_transaction(
        self,
        *,
        correlation_id: str,
        phase: str,
    ) -> AsyncIterator[tuple]:
        """
        Open a dedicated DB transaction for a command phase.

        IMPORTANT:
        - Never reuses constructor-injected repositories/sessions.
        - Each phase gets a fresh session/transaction boundary.
        """
        async for session in self.session_factory():
            logger.info(
                "tx_open flow=actuator_command ownership=fresh correlation_id=%s phase=%s session_id=%s",
                correlation_id,
                phase,
                id(session),
            )
            try:
                yield session, ActuatorRepository(session), ESPRepository(session)
                await session.commit()
                logger.info(
                    "tx_commit flow=actuator_command ownership=fresh correlation_id=%s phase=%s session_id=%s",
                    correlation_id,
                    phase,
                    id(session),
                )
            except Exception:
                await session.rollback()
                logger.error(
                    "tx_rollback flow=actuator_command ownership=fresh correlation_id=%s phase=%s session_id=%s",
                    correlation_id,
                    phase,
                    id(session),
                    exc_info=True,
                )
                raise
            finally:
                logger.info(
                    "tx_closed flow=actuator_command ownership=fresh correlation_id=%s phase=%s session_id=%s",
                    correlation_id,
                    phase,
                    id(session),
                )
            break

    async def _validate_safety_with_fresh_context(
        self,
        *,
        esp_id: str,
        gpio: int,
        command: str,
        value: float,
        correlation_id: str,
    ):
        """
        Validate safety in a dedicated fresh DB session.

        This avoids using stale startup sessions captured by long-lived service instances
        and prevents cross-task session sharing in the actuator hot path.
        """
        # Keep explicit test doubles (MagicMock/AsyncMock) working in unit tests.
        if not isinstance(self.safety_service, SafetyService):
            return await self.safety_service.validate_actuator_command(
                esp_id=esp_id,
                gpio=gpio,
                command=command,
                value=value,
            )

        async with self._command_transaction(
            correlation_id=correlation_id,
            phase="safety_validate",
        ) as (_, actuator_repo, esp_repo):
            safety_service = SafetyService(actuator_repo, esp_repo)
            return await safety_service.validate_actuator_command(
                esp_id=esp_id,
                gpio=gpio,
                command=command,
                value=value,
            )

    @staticmethod
    def _format_fail_reason(*, issued_by: str, reason: str) -> str:
        base_reason = str(reason or "unknown_failure").strip()
        issuer = str(issued_by or "unknown")
        return f"{base_reason} (issued_by={issuer})"

    async def _persist_terminal_failure(
        self,
        *,
        esp_id: str,
        gpio: int,
        command: str,
        value: float,
        issued_by: str,
        correlation_id: str,
        failure_code: str,
        failure_reason: str,
        context: ActuatorCommandContext | None = None,
        transport_fail: bool = False,
        persist_command_audit: bool = True,
    ) -> None:
        """
        Persist deterministic terminal failure state for command branches.

        - transport_fail=False: write command_outcomes terminal row under intent_id=correlation_id.
        - transport_fail=True: write command_transport_fail terminal authority row.
        """
        async with self._command_transaction(
            correlation_id=correlation_id,
            phase="persist_terminal_failure",
        ) as (session, actuator_repo, esp_repo):
            contract_repo = CommandContractRepository(session)
            enriched_reason = self._format_fail_reason(
                issued_by=issued_by,
                reason=failure_reason,
            )

            if transport_fail:
                await contract_repo.upsert_terminal_event_authority(
                    event_class="command_transport_fail",
                    dedup_key=correlation_id,
                    esp_id=esp_id,
                    outcome="failed",
                    correlation_id=correlation_id,
                    code=failure_code,
                    reason=enriched_reason,
                    retryable=False,
                    is_final=True,
                )
            else:
                await contract_repo.upsert_outcome(
                    payload={
                        "intent_id": correlation_id,
                        "correlation_id": correlation_id,
                        "flow": "command",
                        "outcome": "failed",
                        "contract_version": 2,
                        "semantic_mode": "target",
                        "legacy_status": "failed",
                        "target_status": "failed",
                        "is_final": True,
                        "code": failure_code,
                        "reason": enriched_reason,
                        "retryable": False,
                    },
                    esp_id=esp_id,
                )

            if persist_command_audit:
                resolved_context = context
                if resolved_context is None:
                    esp_device = await esp_repo.get_by_device_id(esp_id)
                    if esp_device:
                        actuator_config = await actuator_repo.get_by_esp_and_gpio(
                            esp_device.id, gpio
                        )
                        resolved_context = ActuatorCommandContext(
                            esp_uuid=esp_device.id,
                            actuator_type=(
                                actuator_config.actuator_type if actuator_config else "unknown"
                            ),
                            is_noop=False,
                        )

                if resolved_context is not None:
                    await actuator_repo.log_command(
                        esp_id=resolved_context.esp_uuid,
                        gpio=gpio,
                        actuator_type=resolved_context.actuator_type,
                        command_type=command,
                        value=value,
                        success=False,
                        issued_by=issued_by,
                        error_message=failure_reason,
                    )

                audit_repo = AuditLogRepository(session)
                await audit_repo.log_actuator_command(
                    esp_id=esp_id,
                    gpio=gpio,
                    command=command,
                    value=value,
                    issued_by=issued_by,
                    success=False,
                    error_message=failure_reason,
                    correlation_id=correlation_id,
                )

    async def _load_command_context(
        self,
        *,
        esp_id: str,
        gpio: int,
        command: str,
        value: float,
        correlation_id: str,
    ) -> Optional[ActuatorCommandContext]:
        """Resolve ESP/config/current-state in one read transaction."""
        async with self._command_transaction(
            correlation_id=correlation_id,
            phase="load_context",
        ) as (_, actuator_repo, esp_repo):
            esp_device = await esp_repo.get_by_device_id(esp_id)
            if not esp_device:
                return None

            actuator_config = await actuator_repo.get_by_esp_and_gpio(esp_device.id, gpio)
            actuator_type = actuator_config.actuator_type if actuator_config else "unknown"

            current_state = await actuator_repo.get_state(esp_device.id, gpio)
            is_noop = self._is_noop_delta(
                command=command,
                value=value,
                current_state=current_state,
            )

            return ActuatorCommandContext(
                esp_uuid=esp_device.id,
                actuator_type=actuator_type,
                is_noop=is_noop,
            )

    async def _log_safety_rejection(
        self,
        *,
        esp_id: str,
        gpio: int,
        command: str,
        value: float,
        issued_by: str,
        error_message: str | None,
        correlation_id: str,
    ) -> None:
        """Persist failed safety validation attempt in an isolated transaction."""
        async with self._command_transaction(
            correlation_id=correlation_id,
            phase="persist_safety_rejection",
        ) as (session, actuator_repo, esp_repo):
            esp_device = await esp_repo.get_by_device_id(esp_id)
            if not esp_device:
                return

            await actuator_repo.log_command(
                esp_id=esp_device.id,
                gpio=gpio,
                actuator_type="unknown",
                command_type=command,
                value=value,
                success=False,
                issued_by=issued_by,
                error_message=error_message,
            )
            audit_repo = AuditLogRepository(session)
            await audit_repo.log_actuator_command(
                esp_id=esp_id,
                gpio=gpio,
                command=command,
                value=value,
                issued_by=issued_by,
                success=False,
                error_message=f"Safety check failed: {error_message}",
                correlation_id=correlation_id,
            )

    async def _persist_noop_skip(
        self,
        *,
        context: ActuatorCommandContext,
        gpio: int,
        command: str,
        value: float,
        issued_by: str,
        correlation_id: str,
    ) -> None:
        """Persist no-op command skip in isolated transaction."""
        async with self._command_transaction(
            correlation_id=correlation_id,
            phase="persist_noop_skip",
        ) as (_, actuator_repo, _):
            await actuator_repo.log_command(
                esp_id=context.esp_uuid,
                gpio=gpio,
                actuator_type=context.actuator_type,
                command_type=command,
                value=value,
                success=True,
                issued_by=f"{issued_by}:noop_delta",
                metadata={"skipped": "desired_equals_current"},
            )

    async def _persist_publish_failure(
        self,
        *,
        esp_id: str,
        gpio: int,
        command: str,
        value: float,
        issued_by: str,
        context: ActuatorCommandContext,
        correlation_id: str,
    ) -> None:
        """Persist publish failure in isolated transaction."""
        async with self._command_transaction(
            correlation_id=correlation_id,
            phase="persist_publish_failure",
        ) as (session, actuator_repo, _):
            await actuator_repo.log_command(
                esp_id=context.esp_uuid,
                gpio=gpio,
                actuator_type=context.actuator_type,
                command_type=command,
                value=value,
                success=False,
                issued_by=issued_by,
                error_message="MQTT publish failed",
            )
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

    async def _persist_publish_success(
        self,
        *,
        esp_id: str,
        gpio: int,
        command: str,
        value: float,
        duration: int,
        issued_by: str,
        safety_warnings: list[str],
        context: ActuatorCommandContext,
        correlation_id: str,
    ) -> None:
        """Persist intent + command/audit success in isolated transaction."""
        async with self._command_transaction(
            correlation_id=correlation_id,
            phase="persist_publish_success",
        ) as (session, actuator_repo, _):
            contract_repo = CommandContractRepository(session)
            try:
                await contract_repo.record_intent_publish_sent(
                    intent_id=correlation_id,
                    correlation_id=correlation_id,
                    esp_id=esp_id,
                    flow="command",
                )
            except Exception:
                # Contract persistence is non-blocking for actuator dispatch.
                logger.warning(
                    "Intent contract persistence failed (continuing): correlation_id=%s esp_id=%s flow=command",
                    correlation_id,
                    esp_id,
                    exc_info=True,
                )

            await actuator_repo.log_command(
                esp_id=context.esp_uuid,
                gpio=gpio,
                actuator_type=context.actuator_type,
                command_type=command,
                value=value,
                success=True,
                issued_by=issued_by,
                metadata={
                    "duration": duration,
                    "safety_warnings": safety_warnings,
                },
            )
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
        context: ActuatorCommandContext | None = None
        command_sent = False
        try:
            # Step 1: Safety validation (CRITICAL - MUST be called before every command!)
            safety_result = await self._validate_safety_with_fresh_context(
                esp_id=esp_id,
                gpio=gpio,
                command=command,
                value=value,
                correlation_id=correlation_id,
            )
            warnings = list(safety_result.warnings or [])

            if not safety_result.valid:
                logger.error(
                    f"Actuator command rejected by safety check: esp_id={esp_id}, "
                    f"gpio={gpio}, command={command}, error={safety_result.error}"
                )

                # Log failed command attempt
                await self._log_safety_rejection(
                    esp_id=esp_id,
                    gpio=gpio,
                    command=command,
                    value=value,
                    issued_by=issued_by,
                    error_message=safety_result.error,
                    correlation_id=correlation_id,
                )
                try:
                    await self._persist_terminal_failure(
                        esp_id=esp_id,
                        gpio=gpio,
                        command=command,
                        value=value,
                        issued_by=issued_by,
                        correlation_id=correlation_id,
                        failure_code="SAFETY_REJECTED",
                        failure_reason=f"Safety check failed: {safety_result.error}",
                        persist_command_audit=False,
                    )
                except Exception:
                    logger.error(
                        "Terminal fail persistence failed after safety rejection: correlation_id=%s",
                        correlation_id,
                        exc_info=True,
                    )

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
                        correlation_id=correlation_id,
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

            # Step 2: Resolve command context in isolated DB transaction
            context = await self._load_command_context(
                esp_id=esp_id,
                gpio=gpio,
                command=command,
                value=value,
                correlation_id=correlation_id,
            )
            if context is None:
                logger.error(f"ESP device not found: {esp_id}")
                try:
                    await self._persist_terminal_failure(
                        esp_id=esp_id,
                        gpio=gpio,
                        command=command,
                        value=value,
                        issued_by=issued_by,
                        correlation_id=correlation_id,
                        failure_code="ESP_NOT_FOUND",
                        failure_reason=f"ESP device not found: {esp_id}",
                    )
                except Exception:
                    logger.error(
                        "Terminal fail persistence failed for missing ESP: correlation_id=%s",
                        correlation_id,
                        exc_info=True,
                    )
                return ActuatorSendCommandResult(
                    success=False,
                    correlation_id=correlation_id,
                    command_sent=False,
                    safety_warnings=warnings,
                )

            # Reconnect-safe delta guard: if desired output already equals current
            # hardware projection, do not send a duplicate command.
            if context.is_noop:
                logger.info(
                    "Skipping no-op actuator command (desired==current): esp_id=%s gpio=%s command=%s value=%s",
                    esp_id,
                    gpio,
                    command,
                    value,
                )
                await self._persist_noop_skip(
                    context=context,
                    gpio=gpio,
                    command=command,
                    value=value,
                    issued_by=issued_by,
                    correlation_id=correlation_id,
                )
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
                issued_by=issued_by,
            )

            if not success:
                increment_actuator_timeout()
                logger.error(f"Failed to publish actuator command: esp_id={esp_id}, gpio={gpio}")

                await self._persist_publish_failure(
                    esp_id=esp_id,
                    gpio=gpio,
                    command=command,
                    value=value,
                    issued_by=issued_by,
                    context=context,
                    correlation_id=correlation_id,
                )
                try:
                    await self._persist_terminal_failure(
                        esp_id=esp_id,
                        gpio=gpio,
                        command=command,
                        value=value,
                        issued_by=issued_by,
                        correlation_id=correlation_id,
                        failure_code="MQTT_PUBLISH_FAILED",
                        failure_reason="MQTT publish failed",
                        context=context,
                        persist_command_audit=False,
                    )
                except Exception:
                    logger.error(
                        "Terminal fail persistence failed for publish failure: correlation_id=%s",
                        correlation_id,
                        exc_info=True,
                    )

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
                        correlation_id=correlation_id,
                    )
                except Exception:
                    pass  # WebSocket broadcast is best-effort

                return ActuatorSendCommandResult(
                    success=False,
                    correlation_id=correlation_id,
                    command_sent=False,
                    safety_warnings=warnings,
                )
            command_sent = True

            # Step 4: Persist successful dispatch in dedicated DB transaction
            await self._persist_publish_success(
                esp_id=esp_id,
                gpio=gpio,
                command=command,
                value=value,
                duration=duration,
                issued_by=issued_by,
                safety_warnings=warnings,
                context=context,
                correlation_id=correlation_id,
            )

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
                    correlation_id=correlation_id,
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
            try:
                await self._persist_terminal_failure(
                    esp_id=esp_id,
                    gpio=gpio,
                    command=command,
                    value=value,
                    issued_by=issued_by,
                    correlation_id=correlation_id,
                    failure_code=(
                        "SEND_COMMAND_EXCEPTION_POST_DISPATCH"
                        if command_sent
                        else "SEND_COMMAND_EXCEPTION_PRE_DISPATCH"
                    ),
                    failure_reason=f"Error sending actuator command: {e}",
                    context=context,
                    transport_fail=command_sent,
                )
            except Exception:
                logger.error(
                    "Terminal fail persistence failed in exception branch: correlation_id=%s",
                    correlation_id,
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
