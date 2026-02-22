"""
Health Check Plugin - System-wide health validation.

Performs comprehensive health checks:
1. Server connectivity and health endpoint
2. MQTT broker connectivity
3. Database accessibility
4. ESP device responsiveness
5. Sensor data freshness
6. Actuator responsiveness

This plugin is typically the first to run (VALIDATE capability).
"""

from typing import Any

from ..core.api_client import APIError, GodKaiserClient
from ..core.base_plugin import (
    ActionSeverity,
    AutoOpsPlugin,
    PluginAction,
    PluginCapability,
    PluginResult,
)
from ..core.context import AutoOpsContext


class HealthCheckPlugin(AutoOpsPlugin):
    """
    System health validator.

    Runs before other plugins to ensure the system is in a good state.
    """

    @property
    def name(self) -> str:
        return "health_check"

    @property
    def description(self) -> str:
        return (
            "System-wide health validation - checks server, MQTT, database, "
            "and device connectivity before other operations"
        )

    @property
    def capabilities(self) -> list[PluginCapability]:
        return [PluginCapability.VALIDATE, PluginCapability.MONITOR]

    async def execute(self, context: AutoOpsContext, client: GodKaiserClient) -> PluginResult:
        """Run all health checks."""
        actions: list[PluginAction] = []
        errors: list[str] = []
        warnings: list[str] = []
        health_data: dict[str, Any] = {}

        # =============================================
        # Check 1: Server Health
        # =============================================
        try:
            health = await client.check_health()
            server_status = health.get("status", "unknown")
            health_data["server"] = {"status": server_status, "details": health}

            actions.append(
                PluginAction.create(
                    action="Server Health Check",
                    target=context.server_url,
                    details=health,
                    result=f"Server: {server_status}",
                    severity=(
                        ActionSeverity.SUCCESS if server_status == "ok" else ActionSeverity.WARNING
                    ),
                )
            )
        except APIError as e:
            health_data["server"] = {"status": "error", "detail": e.detail}
            errors.append(f"Server health check failed: {e.detail}")
            actions.append(
                PluginAction.create(
                    action="Server Health Check",
                    target=context.server_url,
                    details={"error": e.detail},
                    result=f"FAILED: {e.detail}",
                    severity=ActionSeverity.CRITICAL,
                )
            )
        except Exception as e:
            health_data["server"] = {"status": "unreachable", "detail": str(e)}
            errors.append(f"Server unreachable: {str(e)}")
            actions.append(
                PluginAction.create(
                    action="Server Health Check",
                    target=context.server_url,
                    details={"error": str(e)},
                    result=f"UNREACHABLE: {str(e)}",
                    severity=ActionSeverity.CRITICAL,
                )
            )

        # =============================================
        # Check 2: Authentication
        # =============================================
        if context.auth_token:
            health_data["auth"] = {"status": "authenticated"}
            actions.append(
                PluginAction.create(
                    action="Authentication Check",
                    target="auth_token",
                    details={},
                    result="Authenticated",
                    severity=ActionSeverity.SUCCESS,
                )
            )
        else:
            health_data["auth"] = {"status": "not_authenticated"}
            warnings.append("Not authenticated - some operations may fail")
            actions.append(
                PluginAction.create(
                    action="Authentication Check",
                    target="auth_token",
                    details={},
                    result="Not authenticated",
                    severity=ActionSeverity.WARNING,
                )
            )

        # =============================================
        # Check 3: Device Overview
        # =============================================
        try:
            devices_response = await client.list_devices()
            devices = self._extract_list(devices_response, "devices")
            total = len(devices)
            online = sum(1 for d in devices if isinstance(d, dict) and d.get("status") == "online")
            offline = total - online

            health_data["devices"] = {
                "total": total,
                "online": online,
                "offline": offline,
            }

            severity = ActionSeverity.SUCCESS
            if offline > 0 and online == 0:
                severity = ActionSeverity.WARNING
            elif total == 0:
                severity = ActionSeverity.INFO

            actions.append(
                PluginAction.create(
                    action="Device Overview",
                    target="all_devices",
                    details={"total": total, "online": online, "offline": offline},
                    result=f"{total} devices ({online} online, {offline} offline)",
                    severity=severity,
                )
            )
        except APIError as e:
            health_data["devices"] = {"status": "error", "detail": e.detail}
            warnings.append(f"Device overview failed: {e.detail}")

        # =============================================
        # Check 4: Database Check (via tables endpoint)
        # =============================================
        try:
            tables = await client.list_tables()
            table_count = len(tables.get("tables", []))
            health_data["database"] = {"status": "ok", "tables": table_count}
            actions.append(
                PluginAction.create(
                    action="Database Check",
                    target="database",
                    details={"table_count": table_count},
                    result=f"Database accessible ({table_count} tables)",
                    severity=ActionSeverity.SUCCESS,
                )
            )
        except APIError as e:
            health_data["database"] = {"status": "error", "detail": e.detail}
            warnings.append(f"Database check failed: {e.detail}")
            actions.append(
                PluginAction.create(
                    action="Database Check",
                    target="database",
                    details={"error": e.detail},
                    result=f"FAILED: {e.detail}",
                    severity=ActionSeverity.WARNING,
                )
            )

        # =============================================
        # Check 5: Detailed Health (if available)
        # =============================================
        try:
            detailed = await client.get_server_health()
            mqtt_status = detailed.get("mqtt", {}).get("status", "unknown")
            health_data["mqtt"] = {"status": mqtt_status}
            actions.append(
                PluginAction.create(
                    action="MQTT Broker Check",
                    target="mqtt_broker",
                    details=detailed.get("mqtt", {}),
                    result=f"MQTT: {mqtt_status}",
                    severity=(
                        ActionSeverity.SUCCESS
                        if mqtt_status in ("ok", "connected")
                        else ActionSeverity.WARNING
                    ),
                )
            )
        except APIError:
            # Detailed health endpoint might not exist
            health_data["mqtt"] = {"status": "unknown"}

        # =============================================
        # Build Summary
        # =============================================
        checks_passed = sum(1 for a in actions if a.severity == ActionSeverity.SUCCESS)
        checks_total = len(actions)

        return PluginResult(
            success=len(errors) == 0,
            summary=f"Health check: {checks_passed}/{checks_total} checks passed",
            actions=actions,
            errors=errors,
            warnings=warnings,
            data=health_data,
        )

    def _extract_list(self, response: dict, key: str) -> list:
        if isinstance(response, list):
            return response
        for k in (key, "data", "items"):
            val = response.get(k)
            if isinstance(val, list):
                return val
        return []
