"""Add device_zone_changes audit table

Revision ID: add_device_zone_changes
Revises: add_zone_status_and_fk
Create Date: 2026-03-09

T13-R1 Phase 2: Subzone Orphaning Fix
- Create device_zone_changes table to audit every zone assignment change
"""

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers
revision: str = "add_device_zone_changes"
down_revision: Union[str, None] = "add_zone_status_and_fk"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "device_zone_changes",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("esp_id", sa.String(50), nullable=False),
        sa.Column("old_zone_id", sa.String(50), nullable=True),
        sa.Column("new_zone_id", sa.String(50), nullable=False),
        sa.Column(
            "subzone_strategy",
            sa.String(20),
            server_default="transfer",
            nullable=False,
        ),
        sa.Column("affected_subzones", sa.JSON(), nullable=True),
        sa.Column(
            "changed_by",
            sa.String(100),
            server_default="system",
            nullable=False,
        ),
        sa.Column(
            "changed_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_device_zone_changes_esp_id", "device_zone_changes", ["esp_id"])
    op.create_index("ix_device_zone_changes_changed_at", "device_zone_changes", ["changed_at"])


def downgrade() -> None:
    op.drop_index("ix_device_zone_changes_changed_at", table_name="device_zone_changes")
    op.drop_index("ix_device_zone_changes_esp_id", table_name="device_zone_changes")
    op.drop_table("device_zone_changes")
