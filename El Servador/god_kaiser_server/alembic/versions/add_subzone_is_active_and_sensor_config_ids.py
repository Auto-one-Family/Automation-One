"""Add is_active and assigned_sensor_config_ids to subzone_configs

Revision ID: add_subzone_is_active_sensor_ids
Revises: add_device_zone_changes
Create Date: 2026-03-09

T13-R1 Phase 2/4:
- Add is_active column (subzone lifecycle within zone)
- Add assigned_sensor_config_ids (I2C gpio=0 sensor assignment)
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers
revision: str = "add_subzone_is_active_sensor_ids"
down_revision: Union[str, None] = "add_device_zone_changes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add is_active column (default True)
    op.add_column(
        "subzone_configs",
        sa.Column(
            "is_active",
            sa.Boolean(),
            server_default="true",
            nullable=False,
        ),
    )

    # 2. Add assigned_sensor_config_ids column (JSON array, default [])
    op.add_column(
        "subzone_configs",
        sa.Column(
            "assigned_sensor_config_ids",
            sa.JSON(),
            server_default="[]",
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("subzone_configs", "assigned_sensor_config_ids")
    op.drop_column("subzone_configs", "is_active")
