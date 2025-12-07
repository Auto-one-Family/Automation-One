"""Add last_command and error_message to ActuatorState

Revision ID: c6fb9c8567b5
Revises: 
Create Date: 2024-12-03

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c6fb9c8567b5'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add last_command and error_message columns to actuator_states table."""
    # Add last_command column
    op.add_column(
        'actuator_states',
        sa.Column('last_command', sa.String(50), nullable=True)
    )
    
    # Add error_message column
    op.add_column(
        'actuator_states',
        sa.Column('error_message', sa.String(500), nullable=True)
    )


def downgrade() -> None:
    """Remove last_command and error_message columns from actuator_states table."""
    op.drop_column('actuator_states', 'error_message')
    op.drop_column('actuator_states', 'last_command')
