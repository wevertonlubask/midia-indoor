"""add_devices

Revision ID: d3e4f5g6h7i8
Revises: c2d3e4f5g6h7
Create Date: 2026-10-02 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd3e4f5g6h7i8'
down_revision: Union[str, None] = 'c2d3e4f5g6h7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'devices',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('hostname', sa.String(255), nullable=True),
        sa.Column('mac', sa.String(17), nullable=False, unique=True),
        sa.Column('ip', sa.String(45), nullable=True),
        sa.Column('token_hash', sa.String(64), nullable=False),
        sa.Column('screen_id', sa.String(36), sa.ForeignKey('screens.id', ondelete='SET NULL'), nullable=True),
        sa.Column('agent_version', sa.String(32), nullable=True),
        sa.Column('is_connected', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('last_seen_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('status', sa.JSON(), nullable=True),
        sa.Column('settings', sa.JSON(), nullable=True),
        sa.Column('last_command', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_devices_screen_id', 'devices', ['screen_id'])


def downgrade() -> None:
    op.drop_index('ix_devices_screen_id', table_name='devices')
    op.drop_table('devices')
