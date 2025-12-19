"""
Logic Scheduler

Periodically evaluates timer-triggered rules (time_window conditions).
"""

import asyncio
from typing import Optional

from ..core.logging_config import get_logger
from .logic_engine import LogicEngine

logger = get_logger(__name__)


class LogicScheduler:
    """
    Logic Scheduler for timer-based rule evaluation.
    
    Periodically checks and evaluates rules with time_window conditions.
    """

    def __init__(self, logic_engine: LogicEngine, interval_seconds: int = 60):
        """
        Initialize Logic Scheduler.
        
        Args:
            logic_engine: LogicEngine instance
            interval_seconds: Evaluation interval in seconds (default: 60)
        """
        self.logic_engine = logic_engine
        self.interval_seconds = interval_seconds
        self._running = False
        self._task: Optional[asyncio.Task] = None

    async def start(self) -> None:
        """
        Start scheduler background task.
        
        Should be called on application startup.
        """
        if self._running:
            logger.warning("Logic Scheduler is already running")
            return

        self._running = True
        self._task = asyncio.create_task(self._scheduler_loop())
        logger.info(f"Logic Scheduler started (interval: {self.interval_seconds}s)")

    async def stop(self) -> None:
        """
        Stop scheduler background task.
        
        Should be called on application shutdown.
        """
        if not self._running:
            return

        self._running = False

        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

        logger.info("Logic Scheduler stopped")

    async def _scheduler_loop(self) -> None:
        """
        Main scheduler loop.
        
        Runs periodically to evaluate timer-triggered rules.
        """
        logger.info("Logic Scheduler loop started")

        while self._running:
            try:
                # Wait for interval
                await asyncio.sleep(self.interval_seconds)

                # Evaluate timer-triggered rules
                await self._evaluate_timer_rules()

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in scheduler loop: {e}", exc_info=True)
                # Wait a bit before retrying to avoid tight error loop
                await asyncio.sleep(5.0)

        logger.info("Logic Scheduler loop stopped")

    async def _evaluate_timer_rules(self) -> None:
        """
        Evaluate all timer-triggered rules.
        
        Delegates to LogicEngine.evaluate_timer_triggered_rules().
        """
        try:
            await self.logic_engine.evaluate_timer_triggered_rules()
        except Exception as e:
            logger.error(
                f"Error evaluating timer-triggered rules: {e}",
                exc_info=True,
            )








