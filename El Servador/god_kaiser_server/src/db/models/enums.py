"""
Database Enums for AutomationOne Framework

Centralized enum definitions for database models.
"""

from enum import Enum


class DataSource(str, Enum):
    """
    Data source indicator for time-series data.

    Used to distinguish between production, mock, test, and simulation data.
    This enables filtering in queries and proper data retention policies.

    Values:
        PRODUCTION: Real ESP32 devices in production
        MOCK: MockESP32Client or Debug API generated data
        TEST: Temporary test data (auto-cleanup candidates)
        SIMULATION: Wokwi or other simulator generated data
    """
    PRODUCTION = "production"
    MOCK = "mock"
    TEST = "test"
    SIMULATION = "simulation"

    @classmethod
    def from_string(cls, value: str) -> "DataSource":
        """
        Convert string to DataSource enum.

        Args:
            value: String value to convert

        Returns:
            DataSource enum value, defaults to PRODUCTION if not found
        """
        try:
            return cls(value.lower())
        except (ValueError, AttributeError):
            return cls.PRODUCTION

    @classmethod
    def is_test_data(cls, source: "DataSource") -> bool:
        """
        Check if data source is considered test data (eligible for cleanup).

        Args:
            source: DataSource to check

        Returns:
            True if source is MOCK, TEST, or SIMULATION
        """
        return source in (cls.MOCK, cls.TEST, cls.SIMULATION)
