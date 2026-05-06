"""Add fail_safe_on_disconnect column to actuator_configs

Revision ID: add_actuator_fail_safe
Revises: add_plants_entity_lifecycle_events
Create Date: 2026-05-06

AUT-120: Server-side override for ESP32 fail-safe-on-disconnect default.
- None  -> server has no opinion; ESP32 keeps its built-in default
          (true for critical actuators like pumps/valves, false otherwise).
- True  -> ESP32 must turn the actuator OFF on MQTT disconnect.
- False -> ESP32 keeps the last applied state on disconnect.

Backward compatible: nullable column without server_default. Existing rows
remain NULL, so the previous behaviour (ESP32 default applies) is preserved.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "add_actuator_fail_safe"
down_revision: Union[str, None] = "add_plants_entity_lifecycle_events"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "actuator_configs",
        sa.Column(
            "fail_safe_on_disconnect",
            sa.Boolean(),
            nullable=True,
            comment=(
                "AUT-120: Override ESP32 fail-safe-on-disconnect default. "
                "NULL = ESP32 default applies, TRUE = force OFF on disconnect, "
                "FALSE = keep last state."
            ),
        ),
    )


def downgrade() -> None:
    op.drop_column("actuator_configs", "fail_safe_on_disconnect")
