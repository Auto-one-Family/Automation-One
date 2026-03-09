"""Add zone status, deleted_at, and FK esp_devices.zone_id -> zones.zone_id

Revision ID: add_zone_status_and_fk
Revises: merge_datetime_null_subzones
Create Date: 2026-03-09

T13-R1 Phase 1: Zone Consolidation
- Add status column to zones (active/archived/deleted)
- Add deleted_at and deleted_by columns to zones
- Migrate orphan zone_ids from esp_devices into zones table
- Add FK constraint esp_devices.zone_id -> zones.zone_id
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers
revision: str = "add_zone_status_and_fk"
down_revision: Union[str, None] = "merge_datetime_null_subzones"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add status, deleted_at, deleted_by columns to zones
    op.add_column(
        "zones",
        sa.Column(
            "status",
            sa.String(20),
            server_default="active",
            nullable=False,
        ),
    )
    op.add_column(
        "zones",
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "zones",
        sa.Column("deleted_by", sa.String(64), nullable=True),
    )
    op.create_index("ix_zones_status", "zones", ["status"])

    # 2. Migrate any esp_devices.zone_id values that don't exist in zones table
    # This ensures all referenced zone_ids exist before adding the FK
    op.execute(
        """
        INSERT INTO zones (id, zone_id, name, status, created_at, updated_at)
        SELECT
            gen_random_uuid(),
            e.zone_id,
            e.zone_id,
            'active',
            now(),
            now()
        FROM (
            SELECT DISTINCT zone_id
            FROM esp_devices
            WHERE zone_id IS NOT NULL
              AND zone_id != ''
              AND zone_id NOT IN (SELECT zone_id FROM zones)
        ) e
        """
    )

    # 3. Set any empty-string zone_ids to NULL before adding FK
    op.execute(
        """
        UPDATE esp_devices SET zone_id = NULL WHERE zone_id = ''
        """
    )

    # 4. Add FK constraint esp_devices.zone_id -> zones.zone_id
    op.create_foreign_key(
        "fk_esp_devices_zone_id_zones",
        "esp_devices",
        "zones",
        ["zone_id"],
        ["zone_id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_esp_devices_zone_id_zones", "esp_devices", type_="foreignkey")
    op.drop_index("ix_zones_status", table_name="zones")
    op.drop_column("zones", "deleted_by")
    op.drop_column("zones", "deleted_at")
    op.drop_column("zones", "status")
