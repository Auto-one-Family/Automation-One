"""
Sensor Repository: Sensor Config and Data Queries
"""

import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import and_, delete, func, or_, select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.logging_config import get_logger
from ..models.sensor import SensorConfig, SensorData
from ..models.esp import ESPDevice
from ..models.enums import DataSource
from .base_repo import BaseRepository

logger = get_logger(__name__)


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

    async def get_by_esp_and_gpio(self, esp_id: uuid.UUID, gpio: int) -> Optional[SensorConfig]:
        """
        Get sensor by ESP ID and GPIO (crash-safe for multi-value sensors).

        DEPRECATED: Prefer get_all_by_esp_and_gpio() or get_by_esp_gpio_and_type()
        for explicit multi-value sensor handling.

        Args:
            esp_id: ESP device UUID
            gpio: GPIO pin number

        Returns:
            SensorConfig or None if not found. Returns first config if multiple exist.
        """
        configs = await self.get_all_by_esp_and_gpio(esp_id, gpio)
        if len(configs) > 1:
            logger.warning(
                "Multiple configs for esp=%s gpio=%s: %s. Returning first.",
                esp_id, gpio, [c.sensor_type for c in configs],
            )
        return configs[0] if configs else None

    async def get_all_by_esp_and_gpio(self, esp_id: uuid.UUID, gpio: int) -> list[SensorConfig]:
        """
        Get ALL sensors on a specific GPIO (Multi-Value Support).

        For multi-value sensors like SHT31, multiple sensor_configs
        can exist on the same GPIO (e.g., sht31_temp + sht31_humidity).

        Args:
            esp_id: ESP device UUID
            gpio: GPIO pin number

        Returns:
            List of SensorConfig instances on this GPIO
        """
        stmt = select(SensorConfig).where(SensorConfig.esp_id == esp_id, SensorConfig.gpio == gpio)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_by_esp_gpio_and_type(
        self, esp_id: uuid.UUID, gpio: int, sensor_type: str
    ) -> Optional[SensorConfig]:
        """
        Get sensor by ESP ID, GPIO, and sensor_type (Multi-Value Support).

        For multi-value sensors, this returns the specific sensor_type
        on a GPIO (e.g., only sht31_temp, not sht31_humidity).

        Args:
            esp_id: ESP device UUID
            gpio: GPIO pin number
            sensor_type: Sensor type string (e.g., 'sht31_temp')

        Returns:
            SensorConfig or None if not found
        """
        stmt = select(SensorConfig).where(
            SensorConfig.esp_id == esp_id,
            SensorConfig.gpio == gpio,
            func.lower(SensorConfig.sensor_type) == sensor_type.lower(),
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
        stmt = select(func.count()).select_from(SensorConfig).where(SensorConfig.esp_id == esp_id)
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
            filters.append(func.lower(SensorConfig.sensor_type) == sensor_type.lower())
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

        stmt = select(SensorConfig, ESPDevice.device_id).join(
            ESPDevice, SensorConfig.esp_id == ESPDevice.id
        )
        if filters:
            stmt = stmt.where(and_(*filters))
        stmt = (
            stmt.order_by(SensorConfig.created_at.desc(), SensorConfig.id.desc())
            .offset(offset)
            .limit(limit)
        )

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
        data_source: str = DataSource.PRODUCTION.value,
        zone_id: Optional[str] = None,
        subzone_id: Optional[str] = None,
        device_name: Optional[str] = None,
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
            data_source: Data source (production, mock, test, simulation)
            zone_id: Zone ID at measurement time (Phase 0.1)
            subzone_id: Subzone ID at measurement time (Phase 0.1)
            device_name: Device name at measurement time (T02-Fix1)

        Returns:
            Created SensorData instance
        """
        # PostgreSQL TIMESTAMP WITHOUT TIME ZONE requires naive datetime
        ts = timestamp or datetime.now(timezone.utc)
        if ts.tzinfo is not None:
            ts = ts.replace(tzinfo=None)

        sensor_data = SensorData(
            esp_id=esp_id,
            gpio=gpio,
            sensor_type=sensor_type,
            raw_value=raw_value,
            processed_value=processed_value,
            unit=unit,
            processing_mode=processing_mode,
            quality=quality,
            timestamp=ts,
            sensor_metadata=metadata,  # Model field is sensor_metadata
            data_source=data_source,
            zone_id=zone_id,
            subzone_id=subzone_id,
            device_name=device_name,
        )
        self.session.add(sensor_data)
        await self.session.flush()
        await self.session.refresh(sensor_data)
        return sensor_data

    async def get_latest_data(
        self, esp_id: uuid.UUID, gpio: int, sensor_type: Optional[str] = None, limit: int = 1
    ) -> list[SensorData]:
        """
        Get latest sensor data.

        Args:
            esp_id: ESP device UUID
            gpio: GPIO pin number
            sensor_type: Optional sensor type filter (required for multi-value
                         sensors like SHT31 where temp and humidity share a GPIO)
            limit: Number of latest records

        Returns:
            List of latest SensorData instances
        """
        filters = [SensorData.esp_id == esp_id, SensorData.gpio == gpio]
        if sensor_type:
            filters.append(SensorData.sensor_type == sensor_type)

        stmt = select(SensorData).where(*filters).order_by(SensorData.timestamp.desc()).limit(limit)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_latest_reading(
        self, esp_id: uuid.UUID, gpio: int, sensor_type: Optional[str] = None
    ) -> Optional[SensorData]:
        """
        Get latest sensor reading (single item).

        Args:
            esp_id: ESP device UUID
            gpio: GPIO pin number
            sensor_type: Optional sensor type filter (required for multi-value
                         sensors like SHT31 where temp and humidity share a GPIO)

        Returns:
            Latest SensorData instance or None
        """
        data = await self.get_latest_data(esp_id, gpio, sensor_type=sensor_type, limit=1)
        return data[0] if data else None

    async def get_latest_readings_batch(
        self,
        sensor_keys: list[tuple[uuid.UUID, int]],
    ) -> dict[tuple[uuid.UUID, int], SensorData]:
        """
        Get latest reading for multiple sensors in a single batch query.

        This method optimizes the common pattern of fetching the latest reading
        for many sensors by using a subquery with MAX(timestamp) instead of
        N individual queries.

        Uses index: idx_esp_gpio_timestamp (esp_id, gpio, timestamp)

        NOTE: For multi-value sensors (e.g. SHT31 with temp + humidity on same
        GPIO), use get_latest_readings_batch_by_config() instead, which includes
        sensor_type in the key to avoid collisions.

        Args:
            sensor_keys: List of (esp_id, gpio) tuples identifying sensors

        Returns:
            Dict mapping (esp_id, gpio) tuple to latest SensorData.
            Sensors without any readings are not included in the result.

        Example:
            >>> keys = [(uuid1, 34), (uuid2, 35), (uuid3, 36)]
            >>> readings = await repo.get_latest_readings_batch(keys)
            >>> latest = readings.get((uuid1, 34))  # SensorData or None
        """
        if not sensor_keys:
            return {}

        # Subquery: Get MAX(timestamp) per (esp_id, gpio)
        max_timestamp_subq = (
            select(
                SensorData.esp_id,
                SensorData.gpio,
                func.max(SensorData.timestamp).label("max_ts"),
            )
            .where(tuple_(SensorData.esp_id, SensorData.gpio).in_(sensor_keys))
            .group_by(SensorData.esp_id, SensorData.gpio)
            .subquery()
        )

        # Main query: Join with subquery to get full SensorData rows
        stmt = select(SensorData).join(
            max_timestamp_subq,
            and_(
                SensorData.esp_id == max_timestamp_subq.c.esp_id,
                SensorData.gpio == max_timestamp_subq.c.gpio,
                SensorData.timestamp == max_timestamp_subq.c.max_ts,
            ),
        )

        result = await self.session.execute(stmt)
        data_list = result.scalars().all()

        # Build lookup dict: (esp_id, gpio) → SensorData
        return {(d.esp_id, d.gpio): d for d in data_list}

    async def get_latest_readings_batch_by_config(
        self,
        sensor_keys: list[tuple[uuid.UUID, int, str]],
    ) -> dict[tuple[uuid.UUID, int, str], SensorData]:
        """
        Get latest reading for multiple sensors including sensor_type in key.

        This variant correctly handles multi-value sensors (e.g. SHT31 with
        sht31_temp + sht31_humidity on the same GPIO) by grouping on
        (esp_id, gpio, sensor_type) instead of just (esp_id, gpio).

        Args:
            sensor_keys: List of (esp_id, gpio, sensor_type) tuples

        Returns:
            Dict mapping (esp_id, gpio, sensor_type) to latest SensorData.
            Sensors without any readings are not included in the result.

        Example:
            >>> keys = [(uuid1, 21, 'sht31_temp'), (uuid1, 21, 'sht31_humidity')]
            >>> readings = await repo.get_latest_readings_batch_by_config(keys)
            >>> latest_temp = readings.get((uuid1, 21, 'sht31_temp'))
            >>> latest_hum = readings.get((uuid1, 21, 'sht31_humidity'))
        """
        if not sensor_keys:
            return {}

        # Subquery: Get MAX(timestamp) per (esp_id, gpio, sensor_type)
        max_timestamp_subq = (
            select(
                SensorData.esp_id,
                SensorData.gpio,
                SensorData.sensor_type,
                func.max(SensorData.timestamp).label("max_ts"),
            )
            .where(
                tuple_(SensorData.esp_id, SensorData.gpio, SensorData.sensor_type).in_(sensor_keys)
            )
            .group_by(SensorData.esp_id, SensorData.gpio, SensorData.sensor_type)
            .subquery()
        )

        # Main query: Join with subquery to get full SensorData rows
        stmt = select(SensorData).join(
            max_timestamp_subq,
            and_(
                SensorData.esp_id == max_timestamp_subq.c.esp_id,
                SensorData.gpio == max_timestamp_subq.c.gpio,
                SensorData.sensor_type == max_timestamp_subq.c.sensor_type,
                SensorData.timestamp == max_timestamp_subq.c.max_ts,
            ),
        )

        result = await self.session.execute(stmt)
        data_list = result.scalars().all()

        # Build lookup dict: (esp_id, gpio, sensor_type) → SensorData
        return {(d.esp_id, d.gpio, d.sensor_type): d for d in data_list}

    async def query_data(
        self,
        esp_id: Optional[uuid.UUID] = None,
        gpio: Optional[int] = None,
        sensor_type: Optional[str] = None,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        quality: Optional[str] = None,
        data_source: Optional[DataSource] = None,
        zone_id: Optional[str] = None,
        subzone_id: Optional[str] = None,
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
            data_source: Optional data source filter (production, mock, test, simulation)
            zone_id: Optional zone filter (Phase 0.1)
            subzone_id: Optional subzone filter (Phase 0.1)
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
            stmt = stmt.where(func.lower(SensorData.sensor_type) == sensor_type.lower())
        if start_time:
            stmt = stmt.where(SensorData.timestamp >= start_time)
        if end_time:
            stmt = stmt.where(SensorData.timestamp <= end_time)
        if quality:
            stmt = stmt.where(SensorData.quality == quality.lower())
        if data_source:
            stmt = stmt.where(SensorData.data_source == data_source.value)
        if zone_id is not None:
            stmt = stmt.where(SensorData.zone_id == zone_id)
        if subzone_id is not None:
            stmt = stmt.where(SensorData.subzone_id == subzone_id)

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
        sensor_type: str | None = None,
    ) -> Optional[SensorConfig]:
        """
        Update calibration data for a sensor.

        Args:
            esp_id: ESP device UUID
            gpio: GPIO pin number
            calibration_data: Calibration parameters (sensor-specific)
            sensor_type: Required for Multi-Value sensors (e.g. sht31_temp, sht31_humidity).
                If omitted and multiple configs exist on (esp_id, gpio), raises ValueError.

        Returns:
            Updated SensorConfig or None if not found
        """
        if sensor_type is not None:
            sensor_config = await self.get_by_esp_gpio_and_type(esp_id, gpio, sensor_type)
        else:
            configs = await self.get_all_by_esp_and_gpio(esp_id, gpio)
            if not configs:
                sensor_config = None
            elif len(configs) == 1:
                sensor_config = configs[0]
            else:
                logger.warning(
                    "update_calibration called without sensor_type but (esp_id=%s, gpio=%s) "
                    "has %d configs. Multi-Value sensors require sensor_type.",
                    esp_id,
                    gpio,
                    len(configs),
                )
                raise ValueError(
                    f"Multiple sensor configs on (esp_id={esp_id}, gpio={gpio}). "
                    "Pass sensor_type for Multi-Value sensors (e.g. sht31_temp, sht31_humidity)."
                )

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
        sensor_type: Optional[str] = None,
    ) -> dict:
        """
        Get statistical summary for sensor data.

        Args:
            esp_id: ESP device UUID
            gpio: GPIO pin number
            start_time: Optional start timestamp
            end_time: Optional end timestamp
            sensor_type: Optional sensor type filter for multi-value sensors

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

        if sensor_type:
            filters.append(func.lower(SensorData.sensor_type) == sensor_type.lower())

        if start_time:
            filters.append(SensorData.timestamp >= start_time)
        if end_time:
            filters.append(SensorData.timestamp <= end_time)

        # DB-side aggregation to avoid loading large datasets into memory where supported.
        # SQLite lacks stddev_pop, so we conditionally compute std_dev in Python for SQLite.
        bind = self.session.get_bind()
        dialect_name = bind.dialect.name if bind is not None else ""
        supports_stddev = dialect_name not in ("sqlite",)

        # Use COALESCE(processed_value, raw_value) to handle rows where processed_value is null
        value_col = func.coalesce(SensorData.processed_value, SensorData.raw_value)
        agg_columns = [
            func.count().label("reading_count"),
            func.min(value_col).label("min_value"),
            func.max(value_col).label("max_value"),
            func.avg(value_col).label("avg_value"),
        ]
        if supports_stddev:
            agg_columns.append(func.stddev_pop(value_col).label("std_dev"))

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
            # Fetch values (non-null) for Python-side stddev; small test datasets are acceptable.
            values_stmt = (
                select(func.coalesce(SensorData.processed_value, SensorData.raw_value))
                .where(*filters)
                .where(
                    or_(SensorData.processed_value.isnot(None), SensorData.raw_value.isnot(None))
                )
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

    # Data source filtering operations
    async def get_by_source(
        self,
        source: DataSource,
        limit: int = 100,
        esp_id: Optional[uuid.UUID] = None,
    ) -> list[SensorData]:
        """
        Get sensor data filtered by data source.

        Args:
            source: Data source (production, mock, test, simulation)
            limit: Maximum number of records
            esp_id: Optional ESP device UUID filter

        Returns:
            List of SensorData instances
        """
        stmt = select(SensorData).where(SensorData.data_source == source.value)
        if esp_id:
            stmt = stmt.where(SensorData.esp_id == esp_id)
        stmt = stmt.order_by(SensorData.timestamp.desc()).limit(limit)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_production_only(self, limit: int = 100) -> list[SensorData]:
        """
        Get only production sensor data (excludes mock/test/simulation).

        Args:
            limit: Maximum number of records

        Returns:
            List of production SensorData instances
        """
        return await self.get_by_source(DataSource.PRODUCTION, limit)

    async def cleanup_test_data(self, older_than_hours: int = 24) -> int:
        """
        Delete test sensor data older than specified hours.

        Only deletes data with data_source='test'. Does not affect
        mock, simulation, or production data.

        Args:
            older_than_hours: Delete data older than this many hours

        Returns:
            Number of deleted records
        """
        cutoff = datetime.now(timezone.utc) - timedelta(hours=older_than_hours)
        stmt = delete(SensorData).where(
            SensorData.data_source == DataSource.TEST.value,
            SensorData.timestamp < cutoff,
        )
        result = await self.session.execute(stmt)
        await self.session.commit()
        return result.rowcount

    async def count_by_source(self) -> dict[str, int]:
        """
        Count sensor data entries grouped by data source.

        Returns:
            Dictionary mapping data source to count
            Example: {"production": 1000, "mock": 50, "test": 25}
        """
        stmt = select(SensorData.data_source, func.count(SensorData.id)).group_by(
            SensorData.data_source
        )
        result = await self.session.execute(stmt)
        return {source: count for source, count in result.all()}

    # =========================================================================
    # MULTI-VALUE SENSOR SUPPORT (I2C/OneWire)
    # =========================================================================

    async def get_by_i2c_address(
        self, esp_id: uuid.UUID, i2c_address: int
    ) -> Optional[SensorConfig]:
        """
        Get sensor by ESP ID and I2C address.

        Used for validating I2C address conflicts.

        Args:
            esp_id: ESP device UUID
            i2c_address: I2C address (0-127)

        Returns:
            SensorConfig or None if not found
        """
        stmt = select(SensorConfig).where(
            SensorConfig.esp_id == esp_id,
            SensorConfig.interface_type == "I2C",
            SensorConfig.i2c_address == i2c_address,
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_onewire_address(
        self, esp_id: uuid.UUID, onewire_address: str
    ) -> Optional[SensorConfig]:
        """
        Get sensor by ESP ID and OneWire device address.

        Used for validating OneWire address conflicts.

        Args:
            esp_id: ESP device UUID
            onewire_address: OneWire device address (16 char hex string)

        Returns:
            SensorConfig or None if not found
        """
        stmt = select(SensorConfig).where(
            SensorConfig.esp_id == esp_id,
            SensorConfig.interface_type == "ONEWIRE",
            SensorConfig.onewire_address == onewire_address,
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_esp_gpio_type_and_onewire(
        self, esp_id: uuid.UUID, gpio: int, sensor_type: str, onewire_address: str
    ) -> Optional[SensorConfig]:
        """
        Get sensor by ESP ID, GPIO, sensor_type, AND OneWire address (4-way lookup).

        **Use-Case:** Multiple DS18B20 OneWire sensors on same GPIO pin.
        Each sensor has unique 64-bit ROM address (onewire_address).

        This is the most specific lookup for OneWire sensors, ensuring
        we match the exact device when multiple DS18B20s share a bus.

        Args:
            esp_id: ESP device UUID
            gpio: GPIO pin number (OneWire bus pin, e.g., 4)
            sensor_type: Sensor type (e.g., 'ds18b20')
            onewire_address: OneWire ROM code (16 hex chars, e.g., '28FF641E8D3C0C79')

        Returns:
            SensorConfig if found, None otherwise

        Example:
            # ESP has 3 DS18B20 sensors on GPIO 4
            # Lookup specific sensor by ROM code
            sensor = await repo.get_by_esp_gpio_type_and_onewire(
                esp_id=uuid,
                gpio=4,
                sensor_type='ds18b20',
                onewire_address='28FF641E8D3C0C79'
            )
        """
        stmt = select(SensorConfig).where(
            SensorConfig.esp_id == esp_id,
            SensorConfig.gpio == gpio,
            func.lower(SensorConfig.sensor_type) == sensor_type.lower(),
            SensorConfig.onewire_address == onewire_address,
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_esp_gpio_type_and_i2c(
        self, esp_id: uuid.UUID, gpio: int, sensor_type: str, i2c_address: int
    ) -> Optional[SensorConfig]:
        """
        Get sensor by ESP ID, GPIO, sensor_type, AND I2C address (4-way lookup).

        **Use-Case:** Multiple I2C sensors of same type at different addresses.
        For example: 2x SHT31 sensors at 0x44 and 0x45 on same I2C bus.

        This is the most specific lookup for I2C sensors, ensuring
        we match the exact device when multiple same-type sensors exist.

        Args:
            esp_id: ESP device UUID
            gpio: GPIO pin number (I2C bus SDA pin, e.g., 21)
            sensor_type: Sensor type (e.g., 'sht31_temp', 'sht31_humidity')
            i2c_address: I2C device address (7-bit, 0-127)

        Returns:
            SensorConfig if found, None otherwise

        Example:
            # ESP has 2x SHT31 sensors at 0x44 and 0x45
            # Lookup specific sensor by I2C address
            sensor = await repo.get_by_esp_gpio_type_and_i2c(
                esp_id=uuid,
                gpio=21,
                sensor_type='sht31_temp',
                i2c_address=0x44
            )
        """
        stmt = select(SensorConfig).where(
            SensorConfig.esp_id == esp_id,
            SensorConfig.gpio == gpio,
            func.lower(SensorConfig.sensor_type) == sensor_type.lower(),
            SensorConfig.i2c_address == i2c_address,
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_all_by_interface(
        self, esp_id: uuid.UUID, interface_type: str
    ) -> list[SensorConfig]:
        """
        Get all sensors of a specific interface type for an ESP.

        Useful for:
        - Listing all I2C sensors (to show I2C bus status)
        - Listing all OneWire sensors (to show OneWire bus status)

        Args:
            esp_id: ESP device UUID
            interface_type: Interface type (I2C, ONEWIRE, ANALOG, DIGITAL)

        Returns:
            List of SensorConfig instances
        """
        stmt = select(SensorConfig).where(
            SensorConfig.esp_id == esp_id, SensorConfig.interface_type == interface_type
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())
