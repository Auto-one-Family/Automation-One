"""
Actuator Repository: Actuator Config, State, and History
"""

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.actuator import ActuatorConfig, ActuatorHistory, ActuatorState
from .base_repo import BaseRepository


class ActuatorRepository(BaseRepository[ActuatorConfig]):
    """Actuator Repository with actuator-specific queries."""

    def __init__(self, session: AsyncSession):
        super().__init__(ActuatorConfig, session)

    async def get_by_esp_and_gpio(
        self, esp_id: uuid.UUID, gpio: int
    ) -> Optional[ActuatorConfig]:
        """Get actuator by ESP ID and GPIO."""
        stmt = select(ActuatorConfig).where(
            ActuatorConfig.esp_id == esp_id, ActuatorConfig.gpio == gpio
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_esp(self, esp_id: uuid.UUID) -> list[ActuatorConfig]:
        """Get all actuators for an ESP device."""
        stmt = select(ActuatorConfig).where(ActuatorConfig.esp_id == esp_id)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_enabled(self) -> list[ActuatorConfig]:
        """Get all enabled actuators."""
        stmt = select(ActuatorConfig).where(ActuatorConfig.enabled == True)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    # State operations
    async def get_state(
        self, esp_id: uuid.UUID, gpio: int
    ) -> Optional[ActuatorState]:
        """Get current actuator state."""
        stmt = select(ActuatorState).where(
            ActuatorState.esp_id == esp_id, ActuatorState.gpio == gpio
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def update_state(
        self,
        esp_id: uuid.UUID,
        gpio: int,
        actuator_type: str,
        current_value: float,
        state: str,
        **kwargs,
    ) -> ActuatorState:
        """Update or create actuator state."""
        existing = await self.get_state(esp_id, gpio)
        if existing:
            existing.current_value = current_value
            existing.state = state
            existing.last_command_timestamp = datetime.utcnow()
            for key, value in kwargs.items():
                if hasattr(existing, key):
                    setattr(existing, key, value)
            await self.session.flush()
            await self.session.refresh(existing)
            return existing
        else:
            new_state = ActuatorState(
                esp_id=esp_id,
                gpio=gpio,
                actuator_type=actuator_type,
                current_value=current_value,
                state=state,
                last_command_timestamp=datetime.utcnow(),
                **kwargs,
            )
            self.session.add(new_state)
            await self.session.flush()
            await self.session.refresh(new_state)
            return new_state

    # History operations
    async def log_command(
        self,
        esp_id: uuid.UUID,
        gpio: int,
        actuator_type: str,
        command_type: str,
        value: Optional[float],
        success: bool,
        issued_by: Optional[str] = None,
        error_message: Optional[str] = None,
        metadata: Optional[dict] = None,
    ) -> ActuatorHistory:
        """Log actuator command to history."""
        history = ActuatorHistory(
            esp_id=esp_id,
            gpio=gpio,
            actuator_type=actuator_type,
            command_type=command_type,
            value=value,
            issued_by=issued_by,
            success=success,
            error_message=error_message,
            metadata=metadata,
        )
        self.session.add(history)
        await self.session.flush()
        await self.session.refresh(history)
        return history

    async def get_history(
        self,
        esp_id: uuid.UUID,
        gpio: int,
        limit: int = 100,
    ) -> list[ActuatorHistory]:
        """Get actuator command history."""
        stmt = (
            select(ActuatorHistory)
            .where(ActuatorHistory.esp_id == esp_id, ActuatorHistory.gpio == gpio)
            .order_by(ActuatorHistory.timestamp.desc())
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())
