"""
Notification Action Executor

Executes notification actions (email, webhook, websocket).
"""

import asyncio
import smtplib
from email.message import EmailMessage
from typing import Dict, Optional

import httpx

from ....core.config import get_settings
from ....core.logging_config import get_logger
from ....websocket.manager import WebSocketManager
from .base import ActionResult, BaseActionExecutor

logger = get_logger(__name__)


class NotificationActionExecutor(BaseActionExecutor):
    """
    Executes notification actions.
    
    Supports:
    - WebSocket notifications (implemented)
    - Email notifications (placeholder for future)
    - Webhook notifications (placeholder for future)
    """

    def __init__(self, websocket_manager: Optional[WebSocketManager] = None):
        """
        Initialize notification executor.
        
        Args:
            websocket_manager: Optional WebSocketManager instance for WebSocket notifications
        """
        self.websocket_manager = websocket_manager

    def supports(self, action_type: str) -> bool:
        """Check if this executor supports notification actions."""
        return action_type == "notification"

    async def execute(self, action: Dict, context: Dict) -> ActionResult:
        """
        Execute notification action.
        
        Args:
            action: Action dictionary with:
                - type: "notification"
                - channel: Notification channel ("email", "webhook", "websocket")
                - target: Target (email address, webhook URL, etc.)
                - message_template: Message template with placeholders
            context: Execution context with:
                - trigger_data: Sensor data that triggered the rule
                - rule_name: Rule name
                - rule_id: Rule ID
                
        Returns:
            ActionResult with execution status
        """
        channel = action.get("channel")
        target = action.get("target")
        message_template = action.get("message_template", "")
        
        # Validate required fields
        if not channel:
            return ActionResult(
                success=False,
                message="Missing 'channel' field in notification action",
            )
        
        if not target:
            return ActionResult(
                success=False,
                message="Missing 'target' field in notification action",
            )
        
        # Get context data for template
        trigger_data = context.get("trigger_data", {})
        rule_name = context.get("rule_name", "Unknown Rule")
        rule_id = context.get("rule_id")
        
        # Format message template
        try:
            message = message_template.format(
                sensor_value=trigger_data.get("value", "N/A"),
                esp_id=trigger_data.get("esp_id", "N/A"),
                gpio=trigger_data.get("gpio", "N/A"),
                sensor_type=trigger_data.get("sensor_type", "N/A"),
                timestamp=trigger_data.get("timestamp", "N/A"),
                rule_name=rule_name,
                rule_id=str(rule_id) if rule_id else "N/A",
            )
        except KeyError as e:
            logger.warning(f"Error formatting notification template: {e}")
            message = message_template  # Use template as-is if formatting fails
        
        # Execute based on channel
        if channel == "websocket":
            return await self._send_websocket_notification(target, message, context)
        if channel == "email":
            return await self._send_email_notification(target, message, context)
        if channel == "webhook":
            return await self._send_webhook_notification(target, message, context)

        return ActionResult(
            success=False,
            message=f"Unsupported notification channel: {channel}",
        )

    async def _send_websocket_notification(
        self, target: str, message: str, context: Dict
    ) -> ActionResult:
        """Send WebSocket notification."""
        if not self.websocket_manager:
            return ActionResult(
                success=False,
                message="WebSocket manager not available",
            )
        
        try:
            # Broadcast notification via WebSocket
            notification_data = {
                "type": "notification",
                "target": target,
                "message": message,
                "rule_name": context.get("rule_name"),
                "rule_id": str(context.get("rule_id")) if context.get("rule_id") else None,
                "timestamp": context.get("trigger_data", {}).get("timestamp"),
            }
            
            await self.websocket_manager.broadcast("notification", notification_data)
            
            return ActionResult(
                success=True,
                message=f"WebSocket notification sent to {target}",
                data={"channel": "websocket", "target": target, "message": message},
            )
        
        except Exception as e:
            logger.error(
                f"Error sending WebSocket notification: {e}",
                exc_info=True,
            )
            return ActionResult(
                success=False,
                message=f"Error sending WebSocket notification: {str(e)}",
            )

    async def _send_email_notification(
        self, target: str, message: str, context: Dict
    ) -> ActionResult:
        """Send email notification via SMTP (blocking call executed in thread)."""
        settings = get_settings()

        if not settings.notification.smtp_enabled:
            return ActionResult(
                success=False,
                message="SMTP is disabled (enable SMTP_ENABLED to send emails)",
            )

        smtp_host = settings.notification.smtp_host
        smtp_port = settings.notification.smtp_port
        smtp_user = settings.notification.smtp_username
        smtp_pass = settings.notification.smtp_password
        use_tls = settings.notification.smtp_use_tls
        sender = settings.notification.smtp_from

        subject = f"Logic notification - {context.get('rule_name', 'Rule')}"

        def _send_email_sync() -> None:
            with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as server:
                if use_tls:
                    server.starttls()
                if smtp_user and smtp_pass:
                    server.login(smtp_user, smtp_pass)

                msg = EmailMessage()
                msg["Subject"] = subject
                msg["From"] = sender
                msg["To"] = target
                msg.set_content(message)

                server.send_message(msg)

        try:
            await asyncio.to_thread(_send_email_sync)
            return ActionResult(
                success=True,
                message=f"Email sent to {target}",
                data={"channel": "email", "target": target},
            )
        except Exception as e:
            logger.error(f"Error sending email notification: {e}", exc_info=True)
            return ActionResult(
                success=False,
                message=f"Error sending email notification: {str(e)}",
            )

    async def _send_webhook_notification(
        self, target: str, message: str, context: Dict
    ) -> ActionResult:
        """Send webhook notification via HTTP POST."""
        settings = get_settings()
        timeout = settings.notification.webhook_timeout_seconds

        payload = {
            "message": message,
            "rule_name": context.get("rule_name"),
            "rule_id": str(context.get("rule_id")) if context.get("rule_id") else None,
            "trigger": context.get("trigger_data", {}),
        }

        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.post(target, json=payload)
                response.raise_for_status()

            return ActionResult(
                success=True,
                message=f"Webhook sent to {target}",
                data={"channel": "webhook", "target": target, "status": response.status_code},
            )
        except httpx.HTTPStatusError as e:
            logger.error(
                f"Webhook returned HTTP error {e.response.status_code} for {target}",
                exc_info=True,
            )
            return ActionResult(
                success=False,
                message=f"Webhook HTTP error: {e.response.status_code}",
            )
        except httpx.RequestError as e:
            logger.error(f"Webhook request failed for {target}: {e}", exc_info=True)
            return ActionResult(
                success=False,
                message=f"Webhook request failed: {str(e)}",
            )
        except Exception as e:
            logger.error(f"Error sending webhook notification: {e}", exc_info=True)
            return ActionResult(
                success=False,
                message=f"Error sending webhook notification: {str(e)}",
            )



