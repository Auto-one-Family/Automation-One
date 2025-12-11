"""
Notification Action Executor

Executes notification actions (email, webhook, websocket).
"""

from typing import Dict, Optional

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
        elif channel == "email":
            return await self._send_email_notification(target, message, context)
        elif channel == "webhook":
            return await self._send_webhook_notification(target, message, context)
        else:
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
        """Send email notification (placeholder for future implementation)."""
        logger.warning(
            f"Email notification not yet implemented: target={target}, message={message[:50]}..."
        )
        
        # TODO: Implement email sending
        # - Integration with email service (SMTP, SendGrid, etc.)
        # - HTML template support
        # - Attachments support
        
        return ActionResult(
            success=False,
            message="Email notifications are not yet implemented",
            data={"channel": "email", "target": target},
        )

    async def _send_webhook_notification(
        self, target: str, message: str, context: Dict
    ) -> ActionResult:
        """Send webhook notification (placeholder for future implementation)."""
        logger.warning(
            f"Webhook notification not yet implemented: target={target}, message={message[:50]}..."
        )
        
        # TODO: Implement webhook sending
        # - HTTP POST request to target URL
        # - Retry logic
        # - Authentication support
        
        return ActionResult(
            success=False,
            message="Webhook notifications are not yet implemented",
            data={"channel": "webhook", "target": target},
        )



