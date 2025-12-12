"""
Sensor Repository: Sensor Config and Data Queries
"""

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.sensor import SensorConfig, SensorData
from ..models.esp import ESPDevice
from .base_repo import BaseRepository


class SensorRepository(BaseRepository[SensorConfig]):
    """
    Sensor Repository with sensor-specific queries.

    Manages both SensorConfig and SensorData models.
    """

    def __init__(self, session: AsyncSession):
        super().__init__(SensorConfig, session)

    async def create(self, sensor: Optional[SensorConfig] = None, **fields) -> SensorConfig:
        """
        Create a new sensor config.
        
        Accepts either a SensorConfig instance or model field kwargs.
        """
        if sensor is None:
            sensor = SensorConfig(**fields)
        self.session.add(sensor)
        await self.session.flush()
        await self.session.refresh(sensor)
        return sensor

    async def get_by_esp_and_gpio(
        self, esp_id: uuid.UUID, gpio: int
    ) -> Optional[SensorConfig]:
        """
        Get sensor by ESP ID and GPIO.

        Args:
            esp_id: ESP device UUID
            gpio: GPIO pin number

        Returns:
            SensorConfig or None if not found
        """
        stmt = select(SensorConfig).where(
            SensorConfig.esp_id == esp_id, SensorConfig.gpio == gpio
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_esp(self, esp_id: uuid.UUID) -> list[SensorConfig]:
        """
        Get all sensors for an ESP device.

        Args:
            esp_id: ESP device UUID

        Returns:
            List of SensorConfig instances
        """
        stmt = select(SensorConfig).where(SensorConfig.esp_id == esp_id)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def count_by_esp(self, esp_id: uuid.UUID) -> int:
        """
        Count sensors for an ESP device.

        Args:
            esp_id: ESP device UUID

        Returns:
            Number of sensors
        """
        stmt = select(func.count()).select_from(SensorConfig).where(
            SensorConfig.esp_id == esp_id
        )
        result = await self.session.execute(stmt)
        return result.scalar() or 0

    async def get_enabled(self) -> list[SensorConfig]:
        """
        Get all enabled sensors.

        Returns:
            List of enabled SensorConfig instances
        """
        stmt = select(SensorConfig).where(SensorConfig.enabled == True)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_pi_enhanced(self) -> list[SensorConfig]:
        """
        Get all Pi-Enhanced sensors.

        Returns:
            List of Pi-Enhanced SensorConfig instances
        """
        stmt = select(SensorConfig).where(SensorConfig.pi_enhanced == True)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_by_sensor_type(self, sensor_type: str) -> list[SensorConfig]:
        """
        Get sensors by type.

        Args:
            sensor_type: Sensor type (temperature, humidity, ph, etc.)

        Returns:
            List of SensorConfig instances
        """
        stmt = select(SensorConfig).where(SensorConfig.sensor_type == sensor_type)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def query_paginated(
        self,
        esp_device_id: Optional[str] = None,
        sensor_type: Optional[str] = None,
        enabled: Optional[bool] = None,
        offset: int = 0,
        limit: int = 20,
    ) -> tuple[list[tuple[SensorConfig, Optional[str]]], int]:
        """
        Query sensors with DB-side filtering and pagination.

        Returns list of (SensorConfig, esp_device_id) and total count.
        """
        filters = []
        if esp_device_id:
            filters.append(ESPDevice.device_id == esp_device_id)
        if sensor_type:
            filters.append(SensorConfig.sensor_type == sensor_type.lower())
        if enabled is not None:
            filters.append(SensorConfig.enabled == enabled)

        count_stmt = (
            select(func.count(SensorConfig.id))
            .select_from(SensorConfig)
            .join(ESPDevice, SensorConfig.esp_id == ESPDevice.id)
        )
        if filters:
            count_stmt = count_stmt.where(and_(*filters))
        total_result = await self.session.execute(count_stmt)
        total = total_result.scalar() or 0

        stmt = (
            select(SensorConfig, ESPDevice.device_id)
            .join(ESPDevice, SensorConfig.esp_id == ESPDevice.id)
        )
        if filters:
            stmt = stmt.where(and_(*filters))
        stmt = stmt.order_by(
            SensorConfig.created_at.desc(), SensorConfig.id.desc()
        ).offset(offset).limit(limit)

        result = await self.session.execute(stmt)
        rows = result.all()
        return rows, total

    # SensorData operations
    async def save_data(
        self,
        esp_id: uuid.UUID,
        gpio: int,
        sensor_type: str,
        raw_value: float,
        processed_value: Optional[float] = None,
        unit: Optional[str] = None,
        processing_mode: str = "raw",
        quality: Optional[str] = None,
        timestamp: Optional[datetime] = None,
        metadata: Optional[dict] = None,
    ) -> SensorData:
        """
        Save sensor data.

        Args:
            esp_id: ESP device UUID
            gpio: GPIO pin number
            sensor_type: Sensor type
            raw_value: Raw sensor value
            processed_value: Processed value (optional)
            unit: Measurement unit (optional)
            processing_mode: Processing mode (raw, pi_enhanced, local)
            quality: Data quality (good, fair, poor, error)
            timestamp: ESP32 timestamp (converted to datetime). If None, uses server time as fallback.
            metadata: Additional metadata

        Returns:
            Created SensorData instance
        """
        sensor_data = SensorData(
            esp_id=esp_id,
            gpio=gpio,
            sensor_type=sensor_type,
            raw_value=raw_value,
            processed_value=processed_value,
            unit=unit,
            processing_mode=processing_mode,
            quality=quality,
            timestamp=timestamp or datetime.utcnow(),
            sensor_metadata=metadata,  # Model field is sensor_metadata
        )
        self.session.add(sensor_data)
        await self.session.flush()
        await self.session.refresh(sensor_data)
        return sensor_data

    async def get_latest_data(
        self, esp_id: uuid.UUID, gpio: int, limit: int = 1
    ) -> list[SensorData]:
        """
        Get latest sensor data.

        Args:
            esp_id: ESP device UUID
            gpio: GPIO pin number
            limit: Number of latest records

        Returns:
            List of latest SensorData instances
        """
        stmt = (
            select(SensorData)
            .where(SensorData.esp_id == esp_id, SensorData.gpio == gpio)
            .order_by(SensorData.timestamp.desc())
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_latest_reading(
        self, esp_id: uuid.UUID, gpio: int
    ) -> Optional[SensorData]:
        """
        Get latest sensor reading (single item).

        Args:
            esp_id: ESP device UUID
            gpio: GPIO pin number

        Returns:
            Latest SensorData instance or None
        """
        data = await self.get_latest_data(esp_id, gpio, limit=1)
        return data[0] if data else None

    async def query_data(
        self,
        esp_id: Optional[uuid.UUID] = None,
        gpio: Optional[int] = None,
        sensor_type: Optional[str] = None,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        quality: Optional[str] = None,
        limit: int = 100,
    ) -> list[SensorData]:
        """
        Query sensor data with optional filters.

        Args:
            esp_id: Optional ESP device UUID
            gpio: Optional GPIO pin number
            sensor_type: Optional sensor type filter
            start_time: Optional start timestamp
            end_time: Optional end timestamp
            quality: Optional quality filter
            limit: Maximum number of records (default: 100)

        Returns:
            List of SensorData instances
        """
        stmt = select(SensorData)

        # Apply filters
        if esp_id is not None:
            stmt = stmt.where(SensorData.esp_id == esp_id)
        if gpio is not None:
            stmt = stmt.where(SensorData.gpio == gpio)
        if sensor_type:
            stmt = stmt.where(SensorData.sensor_type == sensor_type.lower())
        if start_time:
            stmt = stmt.where(SensorData.timestamp >= start_time)
        if end_time:
            stmt = stmt.where(SensorData.timestamp <= end_time)
        if quality:
            stmt = stmt.where(SensorData.quality == quality.lower())

        stmt = stmt.order_by(SensorData.timestamp.desc()).limit(limit)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_data_range(
        self,
        esp_id: uuid.UUID,
        gpio: int,
        start_time: datetime,
        end_time: datetime,
    ) -> list[SensorData]:
        """
        Get sensor data within time range.

        Args:
            esp_id: ESP device UUID
            gpio: GPIO pin number
            start_time: Start timestamp
            end_time: End timestamp

        Returns:
            List of SensorData instances
        """
        stmt = (
            select(SensorData)
            .where(
                SensorData.esp_id == esp_id,
                SensorData.gpio == gpio,
                SensorData.timestamp >= start_time,
                SensorData.timestamp <= end_time,
            )
            .order_by(SensorData.timestamp.asc())
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    # Calibration operations
    async def update_calibration(
        self,
        esp_id: uuid.UUID,
        gpio: int,
        calibration_data: dict,
    ) -> Optional[SensorConfig]:
        """
        Update calibration data for a sensor.

        Args:
            esp_id: ESP device UUID
            gpio: GPIO pin number
            calibration_data: Calibration parameters (sensor-specific)

        Returns:
            Updated SensorConfig or None if not found
        """
        sensor_config = await self.get_by_esp_and_gpio(esp_id, gpio)
        if not sensor_config:
            return None

        sensor_config.calibration_data = calibration_data
        await self.session.flush()
        await self.session.refresh(sensor_config)
        return sensor_config

    async def get_calibration(
        self,
        esp_id: uuid.UUID,
        gpio: int,
    ) -> Optional[dict]:
        """
        Get calibration data for a sensor.

        Args:
            esp_id: ESP device UUID
            gpio: GPIO pin number

        Returns:
            Calibration data dict or None if not found/not calibrated
        """
        sensor_config = await self.get_by_esp_and_gpio(esp_id, gpio)
        if not sensor_config:
            return None
        return sensor_config.calibration_data

    async def get_stats(
        self,
        esp_id: uuid.UUID,
        gpio: int,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
    ) -> dict:
        """
        Get statistical summary for sensor data.

        Args:
            esp_id: ESP device UUID
            gpio: GPIO pin number
            start_time: Optional start timestamp
            end_time: Optional end timestamp

        Returns:
            Dictionary with statistics:
            - min_value: Minimum processed value
            - max_value: Maximum processed value
            - avg_value: Average processed value
            - std_dev: Standard deviation
            - reading_count: Total number of readings
            - quality_distribution: Dict with quality level counts
        """
        filters = [SensorData.esp_id == esp_id, SensorData.gpio == gpio]

        if start_time:
            filters.append(SensorData.timestamp >= start_time)
        if end_time:
            filters.append(SensorData.timestamp <= end_time)

        # DB-side aggregation to avoid loading large datasets into memory where supported.
        # SQLite lacks stddev_pop, so we conditionally compute std_dev in Python for SQLite.
        bind = self.session.get_bind()
        dialect_name = bind.dialect.name if bind is not None else ""
        supports_stddev = dialect_name not in ("sqlite",)

        agg_columns = [
            func.count().label("reading_count"),
            func.min(SensorData.processed_value).label("min_value"),
            func.max(SensorData.processed_value).label("max_value"),
            func.avg(SensorData.processed_value).label("avg_value"),
        ]
        if supports_stddev:
            agg_columns.append(func.stddev_pop(SensorData.processed_value).label("std_dev"))

        agg_stmt = select(*agg_columns).where(*filters)

        quality_stmt = (
            select(SensorData.quality, func.count().label("count"))
            .where(*filters)
            .group_by(SensorData.quality)
        )

        agg_result = await self.session.execute(agg_stmt)
        agg_row = agg_result.one()

        # If no readings, return empty stats
        if agg_row.reading_count == 0:
            return {
                "min_value": None,
                "max_value": None,
                "avg_value": None,
                "std_dev": None,
                "reading_count": 0,
                "quality_distribution": {},
            }

        quality_distribution: dict[str, int] = {}
        q_result = await self.session.execute(quality_stmt)
        for quality, count in q_result.all():
            key = quality or "unknown"
            quality_distribution[key] = count

        # std_dev handling: if DB supports stddev_pop use it; otherwise compute in Python (SQLite)
        std_dev = None
        if supports_stddev:
            std_dev = agg_row.std_dev if agg_row.reading_count > 1 else 0.0
        else:
            # Fetch processed values (non-null) for Python-side stddev; small test datasets are acceptable.
            values_stmt = (
                select(SensorData.processed_value)
                .where(*filters)
                .where(SensorData.processed_value.isnot(None))
            )
            values_result = await self.session.execute(values_stmt)
            values = [v for (v,) in values_result.all() if v is not None]
            if len(values) > 1:
                import statistics

                std_dev = statistics.pstdev(values)  # population stddev to mirror stddev_pop
            elif len(values) == 1:
                std_dev = 0.0

        return {
            "min_value": agg_row.min_value,
            "max_value": agg_row.max_value,
            "avg_value": agg_row.avg_value,
            "std_dev": std_dev,
            "reading_count": agg_row.reading_count,
            "quality_distribution": quality_distribution,
        }
