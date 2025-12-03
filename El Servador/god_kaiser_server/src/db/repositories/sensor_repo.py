"""
Sensor Repository: Sensor Config and Data Queries
"""

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.sensor import SensorConfig, SensorData
from .base_repo import BaseRepository


class SensorRepository(BaseRepository[SensorConfig]):
    """
    Sensor Repository with sensor-specific queries.

    Manages both SensorConfig and SensorData models.
    """

    def __init__(self, session: AsyncSession):
        super().__init__(SensorConfig, session)

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
            metadata=metadata,
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
