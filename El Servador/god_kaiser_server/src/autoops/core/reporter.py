"""
AutoOps Reporter - Generates comprehensive documentation of all actions.

Every AutoOps session generates a timestamped report documenting:
- What was done (every API call, every configuration change)
- What was found (diagnostics, health checks)
- What failed and why
- Recommendations for follow-up
"""

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .base_plugin import PluginAction, PluginResult


class AutoOpsReporter:
    """
    Generates markdown reports for AutoOps sessions.

    Reports are saved to autoops/reports/ with timestamps.
    """

    def __init__(self, reports_dir: str | Path | None = None):
        if reports_dir:
            self.reports_dir = Path(reports_dir)
        else:
            self.reports_dir = Path(__file__).parent.parent / "reports"
        self.reports_dir.mkdir(parents=True, exist_ok=True)

    def generate_session_report(
        self,
        session_id: str,
        context_summary: dict[str, Any],
        plugin_results: list[tuple[str, PluginResult]],
        api_actions: list[PluginAction],
    ) -> str:
        """
        Generate a full session report.

        Args:
            session_id: Unique session identifier
            context_summary: Summary from AutoOpsContext.get_summary()
            plugin_results: List of (plugin_name, PluginResult) tuples
            api_actions: All API actions from the client

        Returns:
            Path to the generated report file.
        """
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        filename = f"autoops_session_{session_id}_{timestamp}.md"
        filepath = self.reports_dir / filename

        lines = [
            "# AutoOps Session Report",
            "",
            f"**Session ID:** {session_id}",
            f"**Generated:** {datetime.now(timezone.utc).isoformat()}",
            f"**Status:** {'ALL PASSED' if all(r.success for _, r in plugin_results) else 'ISSUES FOUND'}",
            "",
            "---",
            "",
        ]

        # Session summary
        lines.extend(
            [
                "## Session Summary",
                "",
                "| Metric | Value |",
                "|--------|-------|",
            ]
        )
        for key, value in context_summary.items():
            lines.append(f"| {key} | {value} |")
        lines.append("")

        # Plugin results
        lines.extend(
            [
                "## Plugin Results",
                "",
            ]
        )

        total_success = 0
        total_failed = 0
        for plugin_name, result in plugin_results:
            status = "PASS" if result.success else "FAIL"
            icon = "+" if result.success else "-"
            if result.success:
                total_success += 1
            else:
                total_failed += 1

            lines.extend(
                [
                    f"### {icon} {plugin_name}: {status}",
                    "",
                    f"**Summary:** {result.summary}",
                    "",
                ]
            )

            if result.actions:
                lines.append(f"**Actions ({len(result.actions)}):**")
                lines.append("")
                lines.append("| # | Action | Target | Result | API |")
                lines.append("|---|--------|--------|--------|-----|")
                for i, action in enumerate(result.actions, 1):
                    api = (
                        f"`{action.api_method} {action.api_endpoint}`"
                        if action.api_endpoint
                        else "-"
                    )
                    lines.append(
                        f"| {i} | {action.action} | {action.target} | " f"{action.result} | {api} |"
                    )
                lines.append("")

            if result.errors:
                lines.append("**Errors:**")
                for error in result.errors:
                    lines.append(f"- {error}")
                lines.append("")

            if result.warnings:
                lines.append("**Warnings:**")
                for warning in result.warnings:
                    lines.append(f"- {warning}")
                lines.append("")

            if result.data:
                lines.append("**Data:**")
                lines.append("```json")
                lines.append(json.dumps(result.data, indent=2, default=str))
                lines.append("```")
                lines.append("")

        # Overall API log
        if api_actions:
            lines.extend(
                [
                    "## Complete API Action Log",
                    "",
                    f"Total API calls: {len(api_actions)}",
                    "",
                    "| # | Time | Method | Endpoint | Status | Action |",
                    "|---|------|--------|----------|--------|--------|",
                ]
            )
            for i, action in enumerate(api_actions, 1):
                method = action.api_method or "-"
                endpoint = action.api_endpoint or "-"
                status_code = action.api_response_code or "-"
                lines.append(
                    f"| {i} | {action.timestamp} | {method} | "
                    f"`{endpoint}` | {status_code} | {action.action} |"
                )
            lines.append("")

        # Final summary
        lines.extend(
            [
                "---",
                "",
                "## Final Summary",
                "",
                f"- **Plugins executed:** {len(plugin_results)}",
                f"- **Passed:** {total_success}",
                f"- **Failed:** {total_failed}",
                f"- **Total API calls:** {len(api_actions)}",
                f"- **Errors:** {sum(len(r.errors) for _, r in plugin_results)}",
                f"- **Warnings:** {sum(len(r.warnings) for _, r in plugin_results)}",
                "",
            ]
        )

        content = "\n".join(lines)
        filepath.write_text(content, encoding="utf-8")
        return str(filepath)

    def generate_quick_summary(
        self,
        plugin_results: list[tuple[str, PluginResult]],
    ) -> str:
        """Generate a short text summary for console output."""
        lines = ["=" * 50, "AUTOOPS SESSION SUMMARY", "=" * 50, ""]

        for plugin_name, result in plugin_results:
            status = "PASS" if result.success else "FAIL"
            icon = "[+]" if result.success else "[-]"
            lines.append(f"{icon} {plugin_name}: {status}")
            lines.append(f"    {result.summary}")
            if result.errors:
                for error in result.errors:
                    lines.append(f"    ERROR: {error}")
            lines.append("")

        total = len(plugin_results)
        passed = sum(1 for _, r in plugin_results if r.success)
        lines.append(f"Result: {passed}/{total} plugins passed")
        lines.append("=" * 50)

        return "\n".join(lines)
