#!/usr/bin/env python3
"""Wait for a readiness marker in a serial logfile."""

from __future__ import annotations

import argparse
import sys
import time
from datetime import datetime
from pathlib import Path


def now_iso() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def append_report(report_file: Path | None, line: str) -> None:
    if report_file is None:
        return
    report_file.parent.mkdir(parents=True, exist_ok=True)
    with report_file.open("a", encoding="utf-8") as handle:
        handle.write(f"{line}\n")


def resolve_log_path(explicit: str | None, auto_latest: bool) -> Path | None:
    if explicit:
        return Path(explicit)
    if not auto_latest:
        return None
    logs = sorted(Path(".").glob("*.log"), key=lambda p: p.stat().st_mtime, reverse=True)
    return logs[0] if logs else None


def main() -> int:
    parser = argparse.ArgumentParser(description="Wait for serial readiness pattern")
    parser.add_argument("--log-file")
    parser.add_argument("--auto-latest-log", action="store_true")
    parser.add_argument("--pattern", default="MQTT connected")
    parser.add_argument("--timeout-seconds", type=int, default=60)
    parser.add_argument("--poll-seconds", type=float, default=1.0)
    parser.add_argument("--fallback-sleep-seconds", type=int, default=35)
    parser.add_argument("--report-file")
    args = parser.parse_args()

    report_path = Path(args.report_file) if args.report_file else None
    log_file = resolve_log_path(args.log_file, args.auto_latest_log)
    if log_file is None or not log_file.exists():
        print(f"[ERROR] Log file not found: {log_file}", file=sys.stderr)
        return 20

    append_report(report_path, f"- Logfile: {log_file}")
    append_report(report_path, f"- Readiness pattern: `{args.pattern}`")
    append_report(report_path, f"- Wait start: {now_iso()}")

    deadline = time.time() + max(args.timeout_seconds, 0)
    while time.time() <= deadline:
        try:
            text = log_file.read_text(encoding="utf-8", errors="replace")
        except OSError:
            text = ""
        if args.pattern in text:
            ts = now_iso()
            print(f"[READY] Pattern matched in {log_file}")
            print(ts)
            append_report(report_path, f"- Readiness matched: {ts}")
            return 0
        time.sleep(max(args.poll_seconds, 0.1))

    if args.fallback_sleep_seconds > 0:
        print(
            f"[WARN] No readiness match after {args.timeout_seconds}s, "
            f"using fallback sleep {args.fallback_sleep_seconds}s."
        )
        # TODO(g04): remove fallback once all scenarios expose deterministic readiness markers.
        time.sleep(args.fallback_sleep_seconds)
        ts = now_iso()
        print(ts)
        append_report(report_path, "- Readiness matched: fallback-used")
        append_report(report_path, f"- Fallback end: {ts}")
        return 0

    print(
        f"[ERROR] Readiness timeout after {args.timeout_seconds}s for {log_file}",
        file=sys.stderr,
    )
    return 21


if __name__ == "__main__":
    raise SystemExit(main())
