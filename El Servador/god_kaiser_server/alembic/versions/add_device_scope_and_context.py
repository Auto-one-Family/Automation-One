"""Add device_scope, assigned_zones, device_active_context table

Revision ID: add_device_scope_and_context
Revises: add_subzone_is_active_sensor_ids
Create Date: 2026-03-09

T13-R2: Multi-Zone Device Scope and Data Routing
- Add device_scope, assigned_zones, assigned_subzones to sensor_configs and actuator_configs
- Create device_active_context table for runtime zone context
- Add change_type column to device_zone_changes
"""

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "add_device_scope_and_context"
down_revision: Union[str, None] = "add_subzone_is_active_sensor_ids"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- sensor_configs: device_scope + assigned_zones + assigned_subzones ---
    op.add_column(
        "sensor_configs",
        sa.Column(
            "device_scope",
            sa.String(20),
            nullable=False,
            server_default="zone_local",
        ),
    )
    op.add_column(
        "sensor_configs",
        sa.Column(
            "assigned_zones",
            sa.JSON(),
            nullable=True,
            server_default="[]",
        ),
    )
    op.add_column(
        "sensor_configs",
        sa.Column(
            "assigned_subzones",
            sa.JSON(),
            nullable=True,
            server_default="[]",
        ),
    )

    # --- actuator_configs: device_scope + assigned_zones + assigned_subzones ---
    op.add_column(
        "actuator_configs",
        sa.Column(
            "device_scope",
            sa.String(20),
            nullable=False,
            server_default="zone_local",
        ),
    )
    op.add_column(
        "actuator_configs",
        sa.Column(
            "assigned_zones",
            sa.JSON(),
            nullable=True,
            server_default="[]",
        ),
    )
    op.add_column(
        "actuator_configs",
        sa.Column(
            "assigned_subzones",
            sa.JSON(),
            nullable=True,
            server_default="[]",
        ),
    )

    # --- device_active_context table ---
    op.create_table(
        "device_active_context",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("config_type", sa.String(20), nullable=False),
        sa.Column("config_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("active_zone_id", sa.String(50), nullable=True),
        sa.Column("active_subzone_id", sa.String(50), nullable=True),
        sa.Column(
            "context_source",
            sa.String(20),
            nullable=False,
            server_default="manual",
        ),
        sa.Column(
            "context_since",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.UniqueConstraint(
            "config_type", "config_id", name="unique_device_active_context"
        ),
    )

    # --- device_zone_changes: add change_type column ---
    op.add_column(
        "device_zone_changes",
        sa.Column(
            "change_type",
            sa.String(20),
            nullable=False,
            server_default="zone_switch",
        ),
    )


def downgrade() -> None:
    op.drop_column("device_zone_changes", "change_type")
    op.drop_table("device_active_context")
    op.drop_column("actuator_configs", "assigned_subzones")
    op.drop_column("actuator_configs", "assigned_zones")
    op.drop_column("actuator_configs", "device_scope")
    op.drop_column("sensor_configs", "assigned_subzones")
    op.drop_column("sensor_configs", "assigned_zones")
    op.drop_column("sensor_configs", "device_scope")
