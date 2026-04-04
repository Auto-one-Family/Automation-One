"""
MQTT Handler: Intent/Outcome Events

Processes intent outcome events emitted by ESP devices and forwards them
to audit logging and WebSocket realtime consumers.

Topic: kaiser/{kaiser_id}/esp/{esp_id}/system/intent_outcome
QoS: 1 (At Least Once)
"""

from __future__ import annotations

from datetime import datetime, timezone
import time
from typing import Optional

from ...core.metrics import (
    increment_config_intent_outcome,
    increment_contract_unknown_code,
    increment_intent_duplicate,
    increment_outcome_recovered_count,
    increment_outcome_retry_count,
    observe_config_commit_duration_ms,
    set_outcome_drop_count_critical,
)
from ...core.logging_config import get_logger
from ...db.models.audit_log import AuditSeverity
from ...db.repositories.audit_log_repo import AuditLogRepository
from ...db.repositories.command_contract_repo import CommandContractRepository
from ...db.session import resilient_session
from ...services.intent_outcome_contract import (
    canonicalize_intent_outcome,
    serialize_intent_outcome_row,
)
from ..topics import TopicBuilder

logger = get_logger(__name__)

class IntentOutcomeHandler:
    """Handle intent outcome messages from ESP devices."""

    async def handle_intent_outcome(self, topic: str, payload: dict) -> bool:
        """Validate and process intent outcome payload."""
        try:
            parsed_topic = TopicBuilder.parse_intent_outcome_topic(topic)
            if not parsed_topic:
                logger.error("Failed to parse intent_outcome topic: %s", topic)
                return False

            payload = dict(payload)
            validation_error = self._validate_payload(payload)
            if validation_error:
                logger.error("Invalid intent_outcome payload: %s", validation_error)
                return False

            esp_id = parsed_topic["esp_id"]
            intent_id = str(payload["intent_id"])
            if not str(payload.get("correlation_id") or "").strip():
                payload["correlation_id"] = f"missing-corr:{intent_id}"
                payload["code"] = "CONTRACT_MISSING_CORRELATION"
                payload["reason"] = "Contract violation: missing correlation_id"
                payload["retryable"] = False

            canonical = canonicalize_intent_outcome(payload)
            payload["flow"] = canonical.flow
            payload["outcome"] = canonical.outcome
            payload["code"] = canonical.code
            payload["reason"] = canonical.reason
            payload["retryable"] = canonical.retryable
            payload["target_status"] = canonical.outcome
            payload["is_final"] = canonical.is_final

            outcome = canonical.outcome
            flow = canonical.flow
            correlation_id = payload.get("correlation_id")
            retry_count = self._to_non_negative_int(payload.get("retry_count"), default=0)
            recovered = bool(payload.get("recovered", False))
            drop_critical_total = self._to_non_negative_int(
                payload.get("outcome_drop_count_critical"),
                default=-1,
            )

            logger.info(
                "Intent outcome received: esp_id=%s flow=%s intent_id=%s outcome=%s",
                esp_id,
                flow,
                intent_id,
                outcome,
            )
            if canonical.is_contract_violation:
                increment_contract_unknown_code("intent_outcome")

            # Persist audit trace for cross-layer correlation.
            try:
                tx_started = time.perf_counter()
                async with resilient_session() as session:
                    contract_repo = CommandContractRepository(session)
                    await contract_repo.upsert_intent(payload, esp_id=esp_id)
                    outcome_row, is_stale = await contract_repo.upsert_outcome(payload, esp_id=esp_id)

                    if is_stale:
                        increment_intent_duplicate()
                        logger.info(
                            "already_processed intent_outcome dedup hit: intent_id=%s generation=%s seq=%s",
                            intent_id,
                            payload.get("generation"),
                            payload.get("seq"),
                        )
                        await session.commit()
                        return True

                    audit_repo = AuditLogRepository(session)
                    await audit_repo.log_device_event(
                        esp_id=esp_id,
                        event_type="intent_outcome",
                        status=outcome_row.outcome,
                        message=f"Intent {intent_id} reached outcome '{outcome}'",
                        details={
                            "intent_id": intent_id,
                            "correlation_id": outcome_row.correlation_id,
                            "flow": outcome_row.flow,
                            "outcome": outcome_row.outcome,
                            "code": outcome_row.code,
                            "reason": outcome_row.reason,
                            "retryable": bool(outcome_row.retryable),
                            "generation": outcome_row.generation,
                            "seq": outcome_row.seq,
                            "epoch": outcome_row.epoch,
                            "ttl_ms": outcome_row.ttl_ms,
                            "ts": outcome_row.ts,
                            "domain": canonical.domain,
                            "severity": canonical.severity,
                            "terminality": canonical.terminality,
                            "retry_policy": canonical.retry_policy,
                            "contract_violation": canonical.is_contract_violation,
                            "raw_flow": canonical.raw_flow,
                            "raw_outcome": canonical.raw_outcome,
                            "reconciliation": payload.get("_reconciliation"),
                        },
                        severity=self._severity_for_outcome(outcome_row.outcome),
                    )
                    await session.commit()
                    observe_config_commit_duration_ms((time.perf_counter() - tx_started) * 1000.0)
                    increment_config_intent_outcome(outcome_row.outcome)
                    if retry_count > 0:
                        increment_outcome_retry_count(retry_count)
                    if recovered:
                        increment_outcome_recovered_count()
                    if drop_critical_total >= 0:
                        set_outcome_drop_count_critical(esp_id, drop_critical_total)

                    # Keep outbound payload consistent with persisted canonical state.
                    correlation_id = outcome_row.correlation_id
                    flow = outcome_row.flow
                    outcome = outcome_row.outcome
                    payload["retryable"] = bool(outcome_row.retryable)
                    payload["generation"] = outcome_row.generation
                    payload["seq"] = outcome_row.seq
                    payload["epoch"] = outcome_row.epoch
                    payload["ts"] = outcome_row.ts
                    payload["contract_version"] = outcome_row.contract_version
                    payload["semantic_mode"] = outcome_row.semantic_mode
                    payload["legacy_status"] = outcome_row.legacy_status
                    payload["target_status"] = outcome_row.target_status
                    payload["is_final"] = bool(outcome_row.is_final)
            except Exception as audit_error:
                logger.error("Failed to store intent_outcome in audit log: %s", audit_error)
                # Critical path: do not acknowledge inbound message without persistence.
                return False

            try:
                from ...websocket.manager import WebSocketManager

                ws_manager = await WebSocketManager.get_instance()
                contract_payload = serialize_intent_outcome_row(outcome_row)
                await ws_manager.broadcast(
                    "intent_outcome",
                    {
                        "esp_id": esp_id,
                        **contract_payload,
                        "domain": canonical.domain,
                        "severity": canonical.severity,
                        "terminality": canonical.terminality,
                        "retry_policy": canonical.retry_policy,
                        "contract_violation": canonical.is_contract_violation,
                        "raw_flow": canonical.raw_flow,
                        "raw_outcome": canonical.raw_outcome,
                        "reconciliation": payload.get("_reconciliation"),
                        "ts": contract_payload.get("ts")
                        or int(datetime.now(timezone.utc).timestamp()),
                    },
                    correlation_id=correlation_id,
                )
            except Exception as ws_error:
                logger.warning("Failed to broadcast intent_outcome WebSocket event: %s", ws_error)

            return True
        except Exception as exc:
            logger.error("Error handling intent_outcome message: %s", exc, exc_info=True)
            return False

    def _validate_payload(self, payload: dict) -> Optional[str]:
        """Return validation error string, or None when valid."""
        required_fields = ("intent_id", "flow", "outcome", "ts")
        for field in required_fields:
            if field not in payload:
                return f"Missing required field: {field}"

        try:
            int(payload["ts"])
        except (TypeError, ValueError):
            return "Invalid ts: must be integer unix timestamp"

        return None

    @staticmethod
    def _severity_for_outcome(outcome: str) -> str:
        if outcome in {"failed", "expired"}:
            return AuditSeverity.ERROR
        if outcome == "rejected":
            return AuditSeverity.WARNING
        return AuditSeverity.INFO

    @staticmethod
    def _to_non_negative_int(value: object, default: int = 0) -> int:
        try:
            parsed = int(value)
        except (TypeError, ValueError):
            return default
        return parsed if parsed >= 0 else default


_handler_instance: Optional[IntentOutcomeHandler] = None


def get_intent_outcome_handler() -> IntentOutcomeHandler:
    """Get singleton intent outcome handler."""
    global _handler_instance
    if _handler_instance is None:
        _handler_instance = IntentOutcomeHandler()
    return _handler_instance


async def handle_intent_outcome(topic: str, payload: dict) -> bool:
    """Convenience function for subscriber registration."""
    handler = get_intent_outcome_handler()
    return await handler.handle_intent_outcome(topic, payload)
