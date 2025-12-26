"""Add data_source field to time-series tables

Revision ID: add_data_source_field
Revises: add_audit_log_indexes
Create Date: 2024-12-24 12:00:00.000000

Adds data_source field to:
- sensor_data: Track origin of sensor readings (production, mock, test, simulation)
- actuator_states: Track origin of actuator state updates
- actuator_history: Track origin of actuator command history

This enables:
- Filtering data by source (exclude mock data in production views)
- Test data retention policies
- Analytics on test vs production data
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_data_source_field'
down_revision = 'add_audit_log_indexes'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add data_source column to sensor_data table
    # Default to 'production' for backwards compatibility with existing data
    op.add_column(
        'sensor_data',
        sa.Column(
            'data_source',
            sa.String(20),
            nullable=False,
            server_default='production'
        )
    )

    # Add data_source column to actuator_states table
    op.add_column(
        'actuator_states',
        sa.Column(
            'data_source',
            sa.String(20),
            nullable=False,
            server_default='production'
        )
    )

    # Add data_source column to actuator_history table
    op.add_column(
        'actuator_history',
        sa.Column(
            'data_source',
            sa.String(20),
            nullable=False,
            server_default='production'
        )
    )

    # Create indexes for efficient filtering by data_source + timestamp
    # These enable fast queries like "get all production sensor data in time range"
    op.create_index(
        'idx_data_source_timestamp',
        'sensor_data',
        ['data_source', 'timestamp'],
        unique=False,
    )

    op.create_index(
        'idx_actuator_data_source_timestamp',
        'actuator_history',
        ['data_source', 'timestamp'],
        unique=False,
    )

    # Simple index for actuator_states (not time-series, so no timestamp combo needed)
    op.create_index(
        'idx_actuator_states_data_source',
        'actuator_states',
        ['data_source'],
        unique=False,
    )


def downgrade() -> None:
    # Drop indexes first
    op.drop_index('idx_actuator_states_data_source', table_name='actuator_states')
    op.drop_index('idx_actuator_data_source_timestamp', table_name='actuator_history')
    op.drop_index('idx_data_source_timestamp', table_name='sensor_data')

    # Drop columns
    op.drop_column('actuator_history', 'data_source')
    op.drop_column('actuator_states', 'data_source')
    op.drop_column('sensor_data', 'data_source')
