"""
Actuator Repository: Actuator Config, State, and History
"""

import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import and_, delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.actuator import ActuatorConfig, ActuatorHistory, ActuatorState
from ..models.esp import ESPDevice
from ..models.enums import DataSource
from .base_repo import BaseRepository


class ActuatorRepository(BaseRepository[ActuatorConfig]):
    """Actuator Repository with actuator-specific queries."""

    def __init__(self, session: AsyncSession):
        super().__init__(ActuatorConfig, session)

    async def create(self, actuator: Optional[ActuatorConfig] = None, **fields) -> ActuatorConfig:
        """
        Create a new actuator config.
        
        Accepts either an ActuatorConfig instance or model field kwargs.
        """
        if actuator is None:
            actuator = ActuatorConfig(**fields)
        self.session.add(actuator)
        await self.session.flush()
        await self.session.refresh(actuator)
        return actuator

    async def get_by_esp_and_gpio(
        self, esp_id: uuid.UUID, gpio: int
    ) -> Optional[ActuatorConfig]:
        """Get actuator by ESP ID and GPIO."""
        stmt = select(ActuatorConfig).where(
            ActuatorConfig.esp_id == esp_id, ActuatorConfig.gpio == gpio
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def query_paginated(
        self,
        esp_device_id: Optional[str] = None,
        actuator_type: Optional[str] = None,
        enabled: Optional[bool] = None,
        offset: int = 0,
        limit: int = 20,
    ) -> tuple[list[tuple[ActuatorConfig, Optional[str], Optional[ActuatorState]]], int]:
        """
        Query actuators with DB-side filtering and pagination.

        Returns list of (ActuatorConfig, esp_device_id, ActuatorState) and total count.
        """
        base_filters = []

        if esp_device_id:
            base_filters.append(ESPDevice.device_id == esp_device_id)
        if actuator_type:
            base_filters.append(ActuatorConfig.actuator_type == actuator_type)
        if enabled is not None:
            base_filters.append(ActuatorConfig.enabled == enabled)

        # Count total with filters
        count_stmt = (
            select(func.count(ActuatorConfig.id))
            .select_from(ActuatorConfig)
            .join(ESPDevice, ActuatorConfig.esp_id == ESPDevice.id)
        )
        if base_filters:
            count_stmt = count_stmt.where(and_(*base_filters))
        total_result = await self.session.execute(count_stmt)
        total = total_result.scalar() or 0

        # Fetch page with ESP device id and current state
        stmt = (
            select(ActuatorConfig, ESPDevice.device_id, ActuatorState)
            .join(ESPDevice, ActuatorConfig.esp_id == ESPDevice.id)
            .outerjoin(
                ActuatorState,
                and_(
                    ActuatorState.esp_id == ActuatorConfig.esp_id,
                    ActuatorState.gpio == ActuatorConfig.gpio,
                ),
            )
        )
        if base_filters:
            stmt = stmt.where(and_(*base_filters))
        stmt = stmt.order_by(
            ActuatorConfig.created_at.desc(), ActuatorConfig.id.desc()
        ).offset(offset).limit(limit)

        result = await self.session.execute(stmt)
        rows = result.all()
        return rows, total

    async def get_by_esp(self, esp_id: uuid.UUID) -> list[ActuatorConfig]:
        """Get all actuators for an ESP device."""
        stmt = select(ActuatorConfig).where(ActuatorConfig.esp_id == esp_id)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def count_by_esp(self, esp_id: uuid.UUID) -> int:
        """Count actuators for an ESP device."""
        stmt = select(func.count()).select_from(ActuatorConfig).where(
            ActuatorConfig.esp_id == esp_id
        )
        result = await self.session.execute(stmt)
        return result.scalar() or 0

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
        timestamp: Optional[datetime] = None,
        data_source: str = DataSource.PRODUCTION.value,
        **kwargs,
    ) -> ActuatorState:
        """
        Update or create actuator state.

        Args:
            timestamp: ESP32 timestamp (converted to datetime). If None, uses server time as fallback.
            data_source: Data source (production, mock, test, simulation)
        """
        existing = await self.get_state(esp_id, gpio)
        command_timestamp = timestamp or datetime.now(timezone.utc)

        if existing:
            existing.current_value = current_value
            existing.state = state
            existing.last_command_timestamp = command_timestamp
            existing.data_source = data_source
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
                last_command_timestamp=command_timestamp,
                data_source=data_source,
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
        timestamp: Optional[datetime] = None,
        metadata: Optional[dict] = None,
        data_source: str = DataSource.PRODUCTION.value,
    ) -> ActuatorHistory:
        """
        Log actuator command to history.

        Args:
            timestamp: ESP32 timestamp (converted to datetime). If None, uses server time as fallback.
            data_source: Data source (production, mock, test, simulation)
        """
        history = ActuatorHistory(
            esp_id=esp_id,
            gpio=gpio,
            actuator_type=actuator_type,
            command_type=command_type,
            value=value,
            issued_by=issued_by,
            success=success,
            error_message=error_message,
            timestamp=timestamp or datetime.utcnow(),
            command_metadata=metadata,
            data_source=data_source,
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
        data_source: Optional[DataSource] = None,
    ) -> list[ActuatorHistory]:
        """
        Get actuator command history.

        Args:
            esp_id: ESP device UUID
            gpio: GPIO pin number
            limit: Maximum number of records
            data_source: Optional data source filter
        """
        stmt = select(ActuatorHistory).where(
            ActuatorHistory.esp_id == esp_id, ActuatorHistory.gpio == gpio
        )
        if data_source:
            stmt = stmt.where(ActuatorHistory.data_source == data_source.value)
        stmt = stmt.order_by(ActuatorHistory.timestamp.desc()).limit(limit)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    # Data source filtering operations
    async def get_history_by_source(
        self,
        source: DataSource,
        limit: int = 100,
        esp_id: Optional[uuid.UUID] = None,
    ) -> list[ActuatorHistory]:
        """
        Get actuator history filtered by data source.

        Args:
            source: Data source (production, mock, test, simulation)
            limit: Maximum number of records
            esp_id: Optional ESP device UUID filter

        Returns:
            List of ActuatorHistory instances
        """
        stmt = select(ActuatorHistory).where(
            ActuatorHistory.data_source == source.value
        )
        if esp_id:
            stmt = stmt.where(ActuatorHistory.esp_id == esp_id)
        stmt = stmt.order_by(ActuatorHistory.timestamp.desc()).limit(limit)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def cleanup_test_history(self, older_than_hours: int = 24) -> int:
        """
        Delete test actuator history older than specified hours.

        Only deletes data with data_source='test'. Does not affect
        mock, simulation, or production data.

        Args:
            older_than_hours: Delete data older than this many hours

        Returns:
            Number of deleted records
        """
        cutoff = datetime.utcnow() - timedelta(hours=older_than_hours)
        stmt = delete(ActuatorHistory).where(
            ActuatorHistory.data_source == DataSource.TEST.value,
            ActuatorHistory.timestamp < cutoff,
        )
        result = await self.session.execute(stmt)
        await self.session.commit()
        return result.rowcount

    async def count_history_by_source(self) -> dict[str, int]:
        """
        Count actuator history entries grouped by data source.

        Returns:
            Dictionary mapping data source to count
            Example: {"production": 1000, "mock": 50, "test": 25}
        """
        stmt = (
            select(ActuatorHistory.data_source, func.count(ActuatorHistory.id))
            .group_by(ActuatorHistory.data_source)
        )
        result = await self.session.execute(stmt)
        return {source: count for source, count in result.all()}
