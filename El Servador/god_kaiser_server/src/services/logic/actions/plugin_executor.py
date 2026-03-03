"""
Plugin Action Executor — Runs AutoOps plugins as Logic Rule actions.

Phase 4C.3.1: New action type 'plugin' / 'autoops_trigger' in the Logic Engine.
When a logic rule fires, it can trigger any registered AutoOps plugin.
"""

from typing import Dict

from ....core.logging_config import get_logger
from ....autoops.core.base_plugin import PluginContext
from ....services.plugin_service import (
    PluginDisabledError,
    PluginNotFoundError,
    PluginService,
)
from .base import ActionResult, BaseActionExecutor

logger = get_logger(__name__)


class PluginActionExecutor(BaseActionExecutor):
    """Executes an AutoOps plugin as a Logic Rule action."""

    def __init__(self, plugin_service: PluginService):
        self.plugin_service = plugin_service

    def supports(self, action_type: str) -> bool:
        """Support both 'plugin' and 'autoops_trigger' action types."""
        return action_type in ("plugin", "autoops_trigger")

    async def execute(self, action: Dict, context: Dict) -> ActionResult:
        """Execute a plugin triggered by a logic rule."""
        plugin_id = action.get("plugin_id")
        if not plugin_id:
            return ActionResult(
                success=False,
                message="Missing 'plugin_id' in action config",
            )

        plugin_context = PluginContext(
            trigger_source="logic_rule",
            trigger_rule_id=context.get("rule_id"),
            trigger_value=context.get("trigger_value"),
            config_overrides=action.get("config", {}),
        )

        try:
            execution = await self.plugin_service.execute_plugin(
                plugin_id=plugin_id,
                user_id=None,  # System trigger, no user
                context=plugin_context,
            )

            return ActionResult(
                success=execution.status == "success",
                message=f"Plugin '{plugin_id}' executed: {execution.status}",
                data={
                    "execution_id": str(execution.id),
                    "status": execution.status,
                    "duration_seconds": execution.duration_seconds,
                },
            )
        except PluginNotFoundError:
            return ActionResult(
                success=False,
                message=f"Plugin '{plugin_id}' not found in registry",
            )
        except PluginDisabledError:
            return ActionResult(
                success=False,
                message=f"Plugin '{plugin_id}' is disabled",
            )
        except Exception as e:
            logger.error(f"Plugin action execution failed: {e}", exc_info=True)
            return ActionResult(
                success=False,
                message=f"Plugin execution failed: {str(e)}",
            )
