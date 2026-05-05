"""
AUT-127 Performance Baseline: Rule evaluation must not introduce O(n) scans in hotpaths.
Baseline: N=100 rule condition evaluations < 500ms (pure Python, no DB I/O).

These tests verify that the synchronous evaluation logic in condition evaluators
remains O(1) per call and does not degrade under repeated invocations.
No database I/O, no MQTT, no network.
"""

import asyncio
import time
from datetime import datetime, timezone
from typing import Any

import pytest

from src.services.logic.conditions.sensor_evaluator import SensorConditionEvaluator
from src.services.logic.conditions.time_evaluator import TimeConditionEvaluator

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

EVALUATION_COUNT = 100
SENSOR_CONDITION_MAX_SECONDS = 0.5
TIME_CONDITION_MAX_SECONDS = 0.2

_TRIGGER_ESP_ID = "ESP_PERF_SENSOR"
_TRIGGER_GPIO = 34


def _make_sensor_condition(value: float = 25.0) -> dict:
    return {
        "type": "sensor",
        "esp_id": _TRIGGER_ESP_ID,
        "gpio": _TRIGGER_GPIO,
        "operator": ">",
        "value": value,
    }


def _make_sensor_context(sensor_value: float = 30.0) -> dict:
    return {
        "sensor_data": {
            "esp_id": _TRIGGER_ESP_ID,
            "gpio": _TRIGGER_GPIO,
            "sensor_type": "ds18b20",
            "value": sensor_value,
            "timestamp": int(datetime.now(timezone.utc).timestamp()),
        },
        "sensor_values": {},
    }


def _make_time_condition() -> dict:
    return {
        "type": "time_window",
        "start_hour": 0,
        "end_hour": 23,
    }


def _make_time_context(current_time: datetime | None = None) -> dict:
    return {
        "current_time": current_time or datetime.now(timezone.utc),
        "rule_name": "perf_time_rule",
    }


class TestSensorConditionPerformanceBaseline:
    """N=100 sensor condition evaluations must complete in under 500ms."""

    @pytest.mark.asyncio
    async def test_evaluate_sensor_condition_n100_under_500ms(self):
        """100 SensorConditionEvaluator.evaluate() calls must finish in < 500ms."""
        evaluator = SensorConditionEvaluator()
        condition = _make_sensor_condition(value=25.0)
        context = _make_sensor_context(sensor_value=30.0)

        # Warm-up: single call outside the measured window
        await evaluator.evaluate(condition, context)

        start = time.perf_counter()
        for _ in range(EVALUATION_COUNT):
            result = await evaluator.evaluate(condition, context)
            # Ensure the evaluator actually runs the comparison (30 > 25 = True)
            assert result is True
        elapsed = time.perf_counter() - start

        assert elapsed < SENSOR_CONDITION_MAX_SECONDS, (
            f"SensorConditionEvaluator: {EVALUATION_COUNT} evaluations took "
            f"{elapsed:.3f}s, limit is {SENSOR_CONDITION_MAX_SECONDS}s"
        )

    @pytest.mark.asyncio
    async def test_evaluate_sensor_condition_n100_false_branch(self):
        """100 evaluations on the False branch (30 < 35) must also finish in < 500ms."""
        evaluator = SensorConditionEvaluator()
        condition = _make_sensor_condition(value=35.0)
        context = _make_sensor_context(sensor_value=30.0)

        start = time.perf_counter()
        for _ in range(EVALUATION_COUNT):
            result = await evaluator.evaluate(condition, context)
            assert result is False
        elapsed = time.perf_counter() - start

        assert elapsed < SENSOR_CONDITION_MAX_SECONDS, (
            f"SensorConditionEvaluator (False-branch): {EVALUATION_COUNT} evaluations took "
            f"{elapsed:.3f}s, limit is {SENSOR_CONDITION_MAX_SECONDS}s"
        )


class TestTimeConditionPerformanceBaseline:
    """N=100 time condition evaluations must complete in under 200ms."""

    @pytest.mark.asyncio
    async def test_evaluate_time_condition_n100_under_200ms(self):
        """100 TimeConditionEvaluator.evaluate() calls must finish in < 200ms."""
        evaluator = TimeConditionEvaluator()
        condition = _make_time_condition()
        # Fix current_time so repeated calls do not invoke datetime.now() inside the evaluator
        fixed_now = datetime(2026, 5, 5, 14, 30, 0, tzinfo=timezone.utc)
        context = _make_time_context(current_time=fixed_now)

        # Warm-up
        await evaluator.evaluate(condition, context)

        start = time.perf_counter()
        for _ in range(EVALUATION_COUNT):
            result = await evaluator.evaluate(condition, context)
            # 14:30 is within 00:00-23:00 window
            assert result is True
        elapsed = time.perf_counter() - start

        assert elapsed < TIME_CONDITION_MAX_SECONDS, (
            f"TimeConditionEvaluator: {EVALUATION_COUNT} evaluations took "
            f"{elapsed:.3f}s, limit is {TIME_CONDITION_MAX_SECONDS}s"
        )

    @pytest.mark.asyncio
    async def test_evaluate_time_condition_n100_out_of_window(self):
        """100 evaluations outside time window also under 200ms."""
        evaluator = TimeConditionEvaluator()
        condition = {
            "type": "time_window",
            "start_hour": 8,
            "end_hour": 10,
        }
        # 14:30 is outside 08:00-10:00
        fixed_now = datetime(2026, 5, 5, 14, 30, 0, tzinfo=timezone.utc)
        context = _make_time_context(current_time=fixed_now)

        start = time.perf_counter()
        for _ in range(EVALUATION_COUNT):
            result = await evaluator.evaluate(condition, context)
            assert result is False
        elapsed = time.perf_counter() - start

        assert elapsed < TIME_CONDITION_MAX_SECONDS, (
            f"TimeConditionEvaluator (out-of-window): {EVALUATION_COUNT} evaluations took "
            f"{elapsed:.3f}s, limit is {TIME_CONDITION_MAX_SECONDS}s"
        )
