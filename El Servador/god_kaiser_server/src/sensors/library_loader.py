"""
Dynamic Library Loader - Loads sensor processing libraries at runtime

Dynamically imports sensor processor modules from sensor_libraries/active/
and provides a registry for accessing processor instances.

Usage:
    loader = LibraryLoader.get_instance()
    ph_processor = loader.get_processor("ph")
    result = ph_processor.process(raw_value=2150, ...)
"""

import importlib
import inspect
import os
from pathlib import Path
from typing import Dict, Optional

from ..core.logging_config import get_logger
from .base_processor import BaseSensorProcessor
from .sensor_type_registry import normalize_sensor_type

logger = get_logger(__name__)


class LibraryLoader:
    """
    Singleton library loader for sensor processors.

    Automatically discovers and loads sensor processor classes from
    sensor_libraries/active/ directory.

    Features:
    - Dynamic module import using importlib
    - Processor instance caching (one instance per sensor type)
    - Automatic discovery of new processors
    - Type validation (all processors must extend BaseSensorProcessor)
    """

    _instance: Optional["LibraryLoader"] = None
    _initialized: bool = False

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        """Initialize library loader (called only once due to singleton)."""
        if self._initialized:
            return

        self.processors: Dict[str, BaseSensorProcessor] = {}
        self.library_path = Path(__file__).parent / "sensor_libraries" / "active"

        # Discover and load all processors
        self._discover_libraries()

        self._initialized = True
        logger.info(
            f"LibraryLoader initialized with {len(self.processors)} processors"
        )

    @classmethod
    def get_instance(cls) -> "LibraryLoader":
        """
        Get singleton library loader instance.

        Returns:
            LibraryLoader instance
        """
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def get_processor(self, sensor_type: str) -> Optional[BaseSensorProcessor]:
        """
        Get processor instance for sensor type.

        Automatically normalizes sensor type from ESP32 format to server processor format
        using the sensor type registry.

        Args:
            sensor_type: Sensor type identifier (e.g., "ph", "temperature_sht31", "sht31_temp")

        Returns:
            BaseSensorProcessor instance or None if not found

        Example:
            processor = loader.get_processor("temperature_sht31")  # Auto-normalized to "sht31_temp"
            if processor:
                result = processor.process(raw_value=2150, ...)
        """
        # Normalize sensor type (ESP32 → Server Processor)
        normalized_type = normalize_sensor_type(sensor_type)
        
        processor = self.processors.get(normalized_type)

        if processor is None:
            logger.warning(
                f"No processor found for sensor type: {sensor_type} "
                f"(normalized: {normalized_type}). "
                f"Available processors: {list(self.processors.keys())}"
            )

        return processor

    def reload_libraries(self):
        """
        Reload all sensor libraries.

        Useful for development/hot-reload scenarios.
        Clears processor cache and re-discovers all libraries.
        """
        logger.info("Reloading sensor libraries...")
        self.processors.clear()
        self._discover_libraries()
        logger.info(
            f"Libraries reloaded. {len(self.processors)} processors available."
        )

    def get_available_sensors(self) -> list[str]:
        """
        Get list of available sensor types.

        Returns:
            List of sensor type identifiers

        Example:
            ["ph", "temperature", "humidity", "ec_sensor", ...]
        """
        return list(self.processors.keys())

    def _discover_libraries(self):
        """
        Discover and load all sensor processor libraries.

        Scans sensor_libraries/active/ directory for Python modules,
        imports them, and extracts BaseSensorProcessor subclasses.
        """
        if not self.library_path.exists():
            logger.error(
                f"Sensor libraries path not found: {self.library_path}. "
                "No processors loaded."
            )
            return

        logger.debug(f"Discovering libraries in: {self.library_path}")

        # Scan for Python files
        for file_path in self.library_path.glob("*.py"):
            # Skip __init__.py
            if file_path.name.startswith("__"):
                continue

            module_name = file_path.stem  # e.g., "ph_sensor"

            try:
                # Import module dynamically
                processor_instance = self._load_library(module_name)

                if processor_instance:
                    sensor_type = processor_instance.get_sensor_type()
                    self.processors[sensor_type] = processor_instance
                    logger.debug(
                        f"Loaded processor: {sensor_type} "
                        f"({processor_instance.__class__.__name__})"
                    )

            except Exception as e:
                logger.error(
                    f"Failed to load library '{module_name}': {e}",
                    exc_info=True,
                )

    def _load_library(self, module_name: str) -> Optional[BaseSensorProcessor]:
        """
        Load a single sensor library module.

        Args:
            module_name: Module name (e.g., "ph_sensor")

        Returns:
            BaseSensorProcessor instance or None if loading failed

        Example:
            processor = self._load_library("ph_sensor")
            # Returns: PHSensorProcessor() instance
        """
        try:
            # Construct full module path
            # e.g., "god_kaiser_server.src.sensors.sensor_libraries.active.ph_sensor"
            full_module_path = (
                f"god_kaiser_server.src.sensors.sensor_libraries.active.{module_name}"
            )

            # Import module
            module = importlib.import_module(full_module_path)

            # Find all classes in module that extend BaseSensorProcessor
            processor_classes = []
            for name, obj in inspect.getmembers(module, inspect.isclass):
                # Check if class is a subclass of BaseSensorProcessor
                # but NOT BaseSensorProcessor itself
                if (
                    issubclass(obj, BaseSensorProcessor)
                    and obj is not BaseSensorProcessor
                ):
                    processor_classes.append(obj)

            if not processor_classes:
                logger.warning(
                    f"Module '{module_name}' has no BaseSensorProcessor subclass. "
                    "Skipping."
                )
                return None

            if len(processor_classes) > 1:
                logger.warning(
                    f"Module '{module_name}' has multiple processor classes: "
                    f"{[cls.__name__ for cls in processor_classes]}. "
                    f"Using first one: {processor_classes[0].__name__}"
                )

            # Instantiate processor
            processor_class = processor_classes[0]
            processor_instance = processor_class()

            logger.debug(
                f"Successfully loaded: {processor_class.__name__} from {module_name}"
            )

            return processor_instance

        except ImportError as e:
            logger.error(
                f"Failed to import module '{module_name}': {e}",
                exc_info=True,
            )
            return None

        except Exception as e:
            logger.error(
                f"Failed to instantiate processor from '{module_name}': {e}",
                exc_info=True,
            )
            return None


# Global loader instance
_loader_instance: Optional[LibraryLoader] = None


def get_library_loader() -> LibraryLoader:
    """
    Get singleton library loader instance (convenience function).

    Returns:
        LibraryLoader instance
    """
    global _loader_instance
    if _loader_instance is None:
        _loader_instance = LibraryLoader.get_instance()
    return _loader_instance
