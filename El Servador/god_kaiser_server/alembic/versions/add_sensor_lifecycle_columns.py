"""Add sensor lifecycle columns (measurement_freshness_hours, calibration_interval_days)

Adds measurement freshness and calibration interval fields to both
sensor_type_defaults and sensor_configs tables for the Sensor-Lifecycle
Vereinheitlichung sprint.

Revision ID: add_sensor_lifecycle
Revises: None (standalone — branched migration graph)
Create Date: 2026-04-15

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "add_sensor_lifecycle"
down_revision: Union[str, None] = None
branch_labels: Sequence[str] = ("sensor_lifecycle",)
depends_on = None


def upgrade() -> None:
    # sensor_type_defaults: add lifecycle columns
    op.add_column(
        "sensor_type_defaults",
        sa.Column("measurement_freshness_hours", sa.Integer(), nullable=True),
    )
    op.add_column(
        "sensor_type_defaults",
        sa.Column("calibration_interval_days", sa.Integer(), nullable=True),
    )

    # sensor_configs: add lifecycle columns (instance overrides)
    op.add_column(
        "sensor_configs",
        sa.Column("measurement_freshness_hours", sa.Integer(), nullable=True),
    )
    op.add_column(
        "sensor_configs",
        sa.Column("calibration_interval_days", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("sensor_configs", "calibration_interval_days")
    op.drop_column("sensor_configs", "measurement_freshness_hours")
    op.drop_column("sensor_type_defaults", "calibration_interval_days")
    op.drop_column("sensor_type_defaults", "measurement_freshness_hours")
